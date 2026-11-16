import { factionEmblemSvg, wordmarkSvg } from "./art/emblems";
// Glue between the pure engine, the Pixi board and the DOM HUD. The human is player 0; the AI is player 1.

import { aiCommand } from "../engine/ai";
import { evadeTarget, expectedDamage, planMelee, planShooting, rangedCanHit, saveNeeded, type AttackPlan } from "../engine/combat";
import { ABILITIES } from "../engine/data/abilities";
import { factionOf, supportOf } from "../engine/data/factions";
import { abilityOf } from "../engine/reactions";
import { CP_CAP, airdropSpotProblem, canPlaySupport, cpPerRound, deployZones, supportTarget } from "../engine/supports";
import {
  abilityUnitProblem,
  actionProblem,
  actionTargets,
  checkTargets,
  commandProblem,
  deploySpotProblem,
  droppableReserves,
  snapPoint,
  supportProblem,
  supportUnitProblem,
  type UnitAction,
} from "../engine/legality";
import { bad, buttonAttrs, cursorCss, cursorKindFor, info, ok, toneGlyph, whyLine, type Cue } from "./cues";
import { arrowEnds, attackLabel, centroid, markFor, markSide, type AttackKind, type AttackMarkView } from "./attackMark";
import { airdropNoGo } from "./fx/dropship";
import { MAPS } from "../engine/data/maps";
import { MISSIONS } from "../engine/data/missions";
import { coverRating, planUnitMove } from "../engine/formation";
import {
  applyCommand,
  createGame,
  planCharge,
  mercyLead,
  type GameSetup,
  RALLY_CP,
} from "../engine/game";
import { dist, pointInZone } from "../engine/geometry";
import { profileFor, profileOf } from "../engine/profile";
import {
  aliveModels,
  canAffordDeploy,
  currentSupply,
  disengageOdds,
  effectiveMove,
  eligibleUnits,
  engagedWith,
  isEngaged,
  onBoard,
  reserves,
  supplyUsed,
  unitById,
} from "../engine/rules";
import { lineOfSight, platformAt, planRoute, shotLine } from "../engine/terrain";
import type { AbilityId, Command, GameEvent, GameState, Model, Unit, Vec, Weapon } from "../engine/types";
import { describeEvent, esc, KEYWORD_TEXT, PHASE_NAMES, weaponLine, impactLine, evadeLine, reportHits, noHarmVerdict, unitName, abilityStatusTags } from "./describe";
import { ComicAlerts, type AlertTone } from "./alerts";
import { DICE_SPEED_LABEL, DiceTray, type DiceRoll, type DiceSpeed } from "./dice";
import { BoardRenderer, drawPos, type RenderView } from "./renderer";
import { audio } from "../audio"; // [audio]
import { aiReserveText, deployChoices, deployMenuDetail, deployMenuTitle, reserveRowsHtml, reservesHeading } from "./recruit";
import { CONFIRM_SLOP_PX, pxToInches, sameOrder } from "./touch";

const HUMAN = 0;
const AI = 1;

/** How a battle ended, for a campaign: the winner (0 is you), the score, and whether you retreated. */
export interface BattleResult {
  winner: GameState["winner"];
  vp: [number, number];
  retreated: boolean;
}

/** Optional hooks into the game screen. */
export interface ControllerHooks {
  /** A campaign battle: the game-over screen and the top bar lead back to the campaign with the result. */
  campaign?: {
    title: string;
    onResult: (r: BattleResult) => void;
  };
}

/** The disengage odds in words: a clean break, or exhausted for the assault phase. */
function disengageText(s: GameState, u: Unit): string {
  const o = disengageOdds(s, u);
  return o.clean ? `Clean break: ${o.mine} vs ${o.theirs} supply` : `Exhausted next phase: ${o.mine} vs ${o.theirs} supply`;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Replace an element's HTML only when it actually changed (keeps buttons alive mid-click). */
function setHTML(el: Element, html: string): boolean {
  const holder = el as HTMLElement & { __html?: string };
  if (holder.__html === html) return false;
  holder.__html = html;
  el.innerHTML = html;
  return true;
}

type Mode =
  /** Context orders: point at ground to move, at an enemy to shoot/charge/fight. */
  | { kind: "auto" }
  | { kind: "none" }
  | { kind: "move" | "advance" | "disengage" | "charge" | "deploy" }
  | { kind: "shoot" | "fight"; weapon: number | null }
  | { kind: "ability"; id: AbilityId }
  /** `unit`: for unit-and-point supports (teleports), the friendly unit picked so far. */
  | { kind: "support"; support: string; ability: string; unit?: string }
  /** Measuring: the first click sets `from`, the second pins `to` (so touch screens, with no hover, can measure); a third starts over. */
  | {
      kind: "measure";
      from?: Vec;
      fromElev?: number;
      fromUnit?: string;
      to?: { pos: Vec; elev: number; unit?: string };
    };

/** The line under each phase banner. */
const PHASE_HINT: Record<string, string> = {
  movement: "Deploy, move, disengage or hunker",
  assault: "Shoot, charge or advance",
  combat: "Engaged units fight. Chargers swing first!",
  scoring: "Tally the objectives, then end-of-round upkeep",
};

export class Controller {
  private state: GameState;
  private selected: string | null = null;
  private leader: number | null = null;
  private deployUid: string | null = null;
  private abilityTarget: string | null = null;
  private mode: Mode = { kind: "none" };
  private hover: Vec | null = null;
  /** Touch play (see touch.ts): the hover came from a tap, and the order it previewed. */
  private touchHover = false;
  private pendingTap: Command | null = null;
  /** Set while a board tap is being handled, so `issue` holds the order for a confirming second tap. */
  private touchTap = false;
  /** When the floating Pass button last appeared (a tap meant for the board mustn't land on it). */
  private passShownAt = 0;
  private aiRunning = false;
  /** States before each of your commands, for Undo. */
  private history: GameState[] = [];
  /** Nobody acts until the opening initiative roll-off has been shown. */
  private started = false;
  private tray: DiceTray;
  private alerts: ComicAlerts;
  private logDrawer: HTMLDivElement;
  private passBtn: HTMLButtonElement;
  private deployMenu: HTMLDivElement | null = null;
  private unread = 0;
  /** Lets phase banners land before the AI carries on. */
  /**
   * Presenting an action: its dice (waiting for you to throw yours), then its outcome, then phase
   * banners and the scoring walkthrough, one step at a time. Nobody acts until it's done.
   */
  private busy = false;
  private presenting: Promise<void> = Promise.resolve();
  /** Events from the command that produced the current state (lets the renderer draw exact effects). */
  private lastEvents: GameEvent[] = [];
  private generation = 0;
  private tooltip: HTMLDivElement;
  /** The attack being declared or resolved: drawn on the board until its dice and outcome have played. */
  private mark: { uid: string; target: string; kind: AttackKind; weapon: string; states: GameState[]; owner?: number; at: number } | null = null;
  private markEl: HTMLDivElement;

  constructor(
    private renderer: BoardRenderer,
    private els: { topbar: HTMLElement; sidebar: HTMLElement; stage: HTMLElement },
    private onNewGame: () => void,
    setup: GameSetup,
    private hooks: ControllerHooks = {},
  ) {
    this.state = createGame(setup);
    // Dev server only: a console handle (window.__scdmg) for poking at the game while testing the UI.
    if (import.meta.env.DEV) (window as unknown as { __scdmg?: unknown }).__scdmg = this;
    this.tooltip = document.createElement("div");
    this.tooltip.className = "tooltip";
    this.tooltip.style.display = "none";
    els.stage.appendChild(this.tooltip);
    this.markEl = document.createElement("div");
    this.markEl.className = "attack-label";
    this.markEl.hidden = true;
    els.stage.appendChild(this.markEl);
    this.tray = new DiceTray(els.stage);
    renderer.autoPhaseBanners = false;
    renderer.onViewChange = () => {
      this.closeDeployMenu();
      this.refresh();
    };
    this.tray.onTumble = (count, quick) => audio.dice(count, quick); // [audio]
    audio.startBattle(this.state, setup.seed); // [audio]
    // Right-hand panel: what you're doing first (unit + actions), then supports, then the army.
    els.sidebar.innerHTML = `
      <section class="panel" id="card"></section>
      <section class="panel actions" id="actions"></section>
      <section class="panel" id="supports"></section>
      <section class="panel" id="army"></section>`;
    this.alerts = new ComicAlerts(els.stage);
    // Battle log lives in a drawer at the bottom of the board, minimised by default.
    this.logDrawer = document.createElement("div");
    this.logDrawer.className = "log-drawer collapsed";
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "secondary log-tab";
    tab.innerHTML = `📜 Battle log <span class="badge"></span>`;
    const logBody = document.createElement("div");
    logBody.id = "log";
    this.logDrawer.append(logBody, tab);
    tab.addEventListener("click", () => {
      this.logDrawer.classList.toggle("collapsed");
      this.unread = 0;
      this.updateLogBadge();
      logBody.scrollTop = logBody.scrollHeight;
    });
    els.stage.appendChild(this.logDrawer);
    // A floating Pass button on the board.
    this.passBtn = document.createElement("button");
    this.passBtn.type = "button";
    this.passBtn.className = "float-pass";
    this.passBtn.hidden = true;
    this.passBtn.addEventListener("click", () => {
      // It pops up when your turn starts, often right where a finger was about to tap the board.
      if (performance.now() - this.passShownAt < 500) return;
      this.issue({ type: "pass", player: HUMAN });
    });
    els.stage.appendChild(this.passBtn);
    renderer.onPointerMove = (p) => {
      this.hover = p;
      this.touchHover = false;
      this.refresh();
    };
    renderer.onPointerLeave = () => {
      this.hover = null;
      this.refresh();
    };
    renderer.onPointerDown = (p, touch) => this.click(p, touch);
    window.onkeydown = (e) => this.key(e);
    const mission = MISSIONS[this.state.missionId]!;
    if (hooks.campaign) this.log(`⚔ <b>Campaign: ${esc(hooks.campaign.title)}.</b>`);
    this.log(
      `<b>${esc(mission.name)} at ${esc(setup.map?.name ?? MAPS[this.state.mapId]?.name ?? "the battlefield")}.</b> ${esc(mission.blurb)} You (${esc(factionOf(setup.factions[0]).name)}, cyan) vs the AI (${esc(factionOf(setup.factions[1]).name)}, red). ${this.state.initiative === HUMAN ? "You have" : "The AI has"} the initiative.`,
    );
    if (mission.roles) {
      this.log(
        `You play <b>${esc(mission.roles[0].name)}</b>: ${esc(mission.roles[0].blurb)} The AI plays <b>${esc(mission.roles[1].name)}</b>: ${esc(mission.roles[1].blurb)}`,
      );
    }
    this.log(
      `Your army starts in reserve. Deploy units into your shaded zone from the <b>Army</b> panel.`,
    );
    this.refresh();
    void this.start();
  }

  /** Opening: show the initiative roll-off, then hand over to whoever won it. */
  private async start(): Promise<void> {
    const rolls = this.state.initiativeRolls ?? [];
    const last = rolls[rolls.length - 1];
    if (last) {
      const ties = rolls.length - 1;
      const gen = this.generation;
      await this.tray.show({
        title: ties ? `Initiative roll-off (${ties} tie${ties > 1 ? "s" : ""} re-rolled)` : "Initiative roll-off",
        groups: [
          { label: "You", rolls: [last[0]], side: "p0", need: null },
          { label: "AI", rolls: [last[1]], side: "p1", need: null },
        ],
        verdict: this.state.orderChoice
          ? this.state.orderChoice.player === HUMAN
            ? "You won: choose who goes first!"
            : "The AI won the roll-off"
          : this.state.initiative === HUMAN
            ? "You go first!"
            : "The AI goes first!",
      });
      if (gen !== this.generation) return;
      // Only once the dice are down (in Throw mode, after you've thrown yours).
      this.log(
        `🎲 Initiative roll-off: you ${last[0]}, AI ${last[1]}${ties ? ` (after ${ties} tie${ties > 1 ? "s" : ""})` : ""}. ${this.state.initiative === HUMAN ? "You" : "The AI"} won and ${this.state.orderChoice ? "chooses who goes first" : "goes first"}.`,
      );
    }
    this.started = true;
    this.refresh();
    void this.runAi();
  }

  /** Dice for the rolls in a batch of events (attacks, impacts, barrages, blasts, morale). */
  private diceFor(events: GameEvent[]): DiceRoll[] {
    const s = this.state;
    const side = (uid: string): "p0" | "p1" => (unitById(s, uid)?.owner === HUMAN ? "p0" : "p1");
    const out: DiceRoll[] = [];
    for (const e of events) {
      if (e.type === "attack") {
        const r = e.report;
        const { rolled, evaded } = reportHits(r);
        const saves: number[] = [];
        const needs: (number | null)[] = [];
        r.saveOn.forEach((need, i) => {
          if (need === null) return;
          saves.push(r.saveRolls[i] ?? 0);
          needs.push(need);
        });
        const label = r.kind === "impact" ? "Impact" : r.kind === "barrage" ? "Blast" : r.kind === "overwatch" ? "Overwatch" : "To hit";
        out.push({
          title: `${unitName(s, r.uid)} → ${unitName(s, r.target)} · ${r.weapon}`,
          groups: [
            {
              label,
              rolls: r.hitRolls,
              need: r.hitOn,
              side: side(r.uid),
              result: `${rolled + (r.precisionMoved ?? 0)} hit${rolled + (r.precisionMoved ?? 0) === 1 ? "" : "s"}${r.precisionMoved ? ` (${r.precisionMoved} by precision)` : ""}`,
            },
            ...(r.evadeRolls && r.evadeRolls.length
              ? [
                  {
                    label: "Evade",
                    rolls: r.evadeRolls,
                    need: r.evadeOn ?? null,
                    side: side(r.target),
                    result: `${evaded} dodged${r.evadesCancelled ? ` (${r.evadesCancelled} tracked)` : ""}`,
                  },
                ]
              : []),
            { label: "Saves", rolls: saves, need: needs, side: side(r.target), result: `${r.damage} dmg` },
          ],
          verdict: r.unitDestroyed ? "Wiped out!" : r.modelsKilled ? `${r.modelsKilled} down!` : noHarmVerdict(r),
        });
      } else if (e.type === "rolloff") {
        const last = e.rolls[e.rolls.length - 1]!;
        out.push({
          title: "Tie on VP: initiative roll-off",
          groups: [
            { label: "You", rolls: [last[0]], side: "p0", need: null },
            { label: "AI", rolls: [last[1]], side: "p1", need: null },
          ],
          verdict: e.winner === HUMAN ? "You choose the order!" : "The AI chooses the order",
        });
      } else if (e.type === "morale") {
        out.push({
          title: `${unitName(s, e.uid)} tests its nerve`,
          groups: [{ label: "2d6", rolls: e.roll, need: null, side: side(e.uid), result: `${e.roll[0] + e.roll[1]} vs ${e.nerve}` }],
          verdict: e.shaken ? "Shaken!" : "Holds firm",
        });
      }
    }
    return out;
  }

  /** Show the dice for some events, one roll after another; resolves when they've been shown. */
  private async playDice(events: GameEvent[]): Promise<void> {
    for (const roll of this.diceFor(events)) await this.tray.show({ ...roll, onSettled: audio.takeOutcome() }); // [audio] hit/KO sounds on settle
  }

  private cycleDice(): void {
    const order: DiceSpeed[] = ["throw", "full", "quick", "off"];
    this.tray.setSpeed(order[(order.indexOf(this.tray.speed) + 1) % order.length]!);
    this.refresh();
  }

  destroy(): void {
    this.generation++;
    this.tooltip.remove();
    this.markEl.remove();
    this.renderer.setCursor("default");
    this.tray.destroy();
    this.alerts.destroy();
    this.logDrawer.remove();
    this.passBtn.remove();
    this.closeDeployMenu();
    window.onkeydown = null;
  }

  // ---------- helpers ----------

  private humanTurn(): boolean {
    return this.started && !this.state.over && !this.aiRunning && !this.busy && this.state.activePlayer === HUMAN;
  }

  private sel(): Unit | undefined {
    return this.selected ? unitById(this.state, this.selected) : undefined;
  }

  private modelAt(p: Vec): { unit: Unit; model: Model } | undefined {
    let best: { unit: Unit; model: Model; d: number } | undefined;
    for (const u of onBoard(this.state)) {
      const r = profileOf(u).baseRadius + 0.15;
      for (const m of aliveModels(u)) {
        const d = dist(drawPos(u, m), p);
        if (d <= r && (!best || d < best.d)) best = { unit: u, model: m, d };
      }
    }
    return best;
  }

  private defaultMode(u: Unit): Mode {
    const p = profileOf(u);
    switch (this.state.phase) {
      case "movement":
      case "assault":
      case "combat":
        void p;
        return { kind: "auto" };
      default:
        return { kind: "none" };
    }
  }

  /** The order the pointer implies right now: an explicit button choice wins, otherwise context decides. */
  private contextMode(sel: Unit, hit: { unit: Unit; model: Model } | undefined): Mode {
    if (this.mode.kind !== "auto") return this.mode;
    const s = this.state;
    const enemy = hit && hit.unit.owner !== sel.owner ? hit.unit : undefined;
    switch (s.phase) {
      case "movement":
        if (enemy) return { kind: "none" };
        return { kind: isEngaged(s, sel) ? "disengage" : "move" };
      case "assault": {
        const weapons = profileOf(sel).weapons;
        if (enemy) {
          if (typeof this.bestWeapon(sel, enemy, false) !== "string") return { kind: "shoot", weapon: null };
          // Neither works: explain the shot unless a charge would (or there's no gun to explain).
          const canCharge = commandProblem(s, { type: "charge", uid: sel.uid, target: enemy.uid }) === null;
          if (canCharge || !weapons.some((w) => !w.melee)) return { kind: "charge" };
          return { kind: "shoot", weapon: null };
        }
        return sel.status.disengaged || isEngaged(s, sel) ? { kind: "none" } : { kind: "advance" };
      }
      case "combat":
        return { kind: "fight", weapon: null };
      default:
        return { kind: "none" };
    }
  }

  private select(u: Unit, leader?: number): void {
    audio.ui("select"); // [audio]
    this.selected = u.uid;
    this.leader = leader ?? aliveModels(u)[0]?.id ?? null;
    this.deployUid = null;
    this.abilityTarget = null;
    this.mode = this.defaultMode(u);
    this.refresh();
  }

  private clearSelection(): void {
    this.pendingTap = null;
    this.selected = null;
    this.leader = null;
    this.deployUid = null;
    this.abilityTarget = null;
    this.mode = { kind: "none" };
  }

  /**
   * Aim lines from each of the shooter's models to the nearest enemy model, marked with what the
   * terrain does to the shot (blocked, cover, cover ignored) and where the weapon's reach ends.
   * `firing` is the models that can actually shoot (null: work it out from range and sight).
   * Returns short notes for the status line.
   */
  private aimLines(view: RenderView, a: Unit, t: Unit, w: Weapon, firing: Set<Model> | null): string[] {
    const s = this.state;
    const ra = profileOf(a).baseRadius;
    const rt = profileOf(t).baseRadius;
    const reach = w.range + ra + rt; // centre to centre
    const tms = aliveModels(t);
    if (!tms.length) return [];
    let shots = 0;
    let covered = 0;
    let short = Infinity;
    let blockedBy: string | null = null;
    let ignored: string | null = null;
    let labelledOk = false;
    let labelledBad = false;
    for (const am of aliveModels(a)) {
      const near = tms.reduce((x, y) => (dist(x.pos, am.pos) <= dist(y.pos, am.pos) ? x : y));
      const d = dist(am.pos, near.pos);
      const line = shotLine(s, am.pos, am.elevation, t, near, a.uid);
      const outOfRange = d > reach + 1e-6;
      const ok = firing ? firing.has(am) : !outOfRange && line.sight;
      if (ok) {
        shots++;
        if (line.cover) covered++;
      } else if (outOfRange) short = Math.min(short, d - reach);
      else blockedBy ??= line.marks.find((m) => m.kind === "blocks")?.note ?? null;
      ignored ??= line.marks.find((m) => m.kind === "cover-ignored")?.note ?? null;
      // Label the distance on one good line and one bad one, not on every model of a big squad.
      const blocked = !line.sight && !outOfRange;
      const label = (ok && !labelledOk) || (!ok && !labelledBad) ? (blocked ? "✕ blocked" : `${Math.max(0, d - ra - rt).toFixed(1)}" of ${w.range}"`) : undefined;
      if (label) {
        if (ok) labelledOk = true;
        else labelledBad = true;
      }
      view.sightLines.push({
        from: drawPos(a, am),
        to: drawPos(t, near),
        ok,
        marks: line.marks,
        rangeT: outOfRange ? reach / d : undefined,
        label,
      });
    }
    const notes: string[] = [];
    if (covered) notes.push(covered === shots ? "🛡 in cover: −1 to their save" : `🛡 ${covered} of ${shots} shots into cover (−1 save)`);
    else if (ignored && shots) notes.push(ignored);
    if (short < Infinity) notes.push(`${shots ? "some models are" : "nearest is"} ${short.toFixed(1)}" out of range`);
    if (blockedBy) notes.push(blockedBy);
    return notes;
  }

  private bestWeapon(
    a: Unit,
    t: Unit,
    melee: boolean,
  ): { index: number; plan: AttackPlan } | string {
    const weapons = profileOf(a).weapons;
    const chosen =
      this.mode.kind === "shoot" || this.mode.kind === "fight" ? this.mode.weapon : null;
    let best: { index: number; plan: AttackPlan; exp: number } | null = null;
    let err = melee ? "No melee weapon" : "No ranged weapon";
    weapons.forEach((w, i) => {
      if (w.melee !== melee || (chosen !== null && chosen !== i)) return;
      // The reducer decides (range, sight, melee rules, provoke, exhaustion); the plan is only for the odds.
      const why = commandProblem(this.state, { type: melee ? "fight" : "shoot", uid: a.uid, target: t.uid, weapon: i });
      if (why) {
        err = why;
        return;
      }
      const plan = melee ? planMelee(a, t, w) : planShooting(this.state, a, t, w);
      if (typeof plan === "string") {
        err = plan;
        return;
      }
      const exp = expectedDamage(this.state, a, t, plan, melee);
      if (!best || exp > best.exp) best = { index: i, plan, exp };
    });
    return best ?? err;
  }

  // ---------- input ----------

  /** Board inches a confirming second tap may be off by (a fingertip on screen at the current zoom). */
  private tapSlop(): number {
    return pxToInches(CONFIRM_SLOP_PX, this.renderer.pixelsPerInch());
  }

  /**
   * A click, or a tap (`touch`). A finger can't hover, so a tap first points the hover (preview, tip,
   * unit card) at where it landed; an order it would give waits for a second tap there (see `issue`).
   */
  private click(raw: Vec, touch = false): void {
    if (!touch) return this.clickAt(raw);
    this.hover = raw;
    this.touchHover = true;
    // Measuring works the same by finger as by mouse (see clickAt): start, pin the far end, start over.
    const held = this.pendingTap;
    this.touchTap = true;
    try {
      this.clickAt(raw);
    } finally {
      this.touchTap = false;
    }
    // Only the very next tap can confirm a preview: a tap elsewhere in between drops it.
    if (this.pendingTap === held) this.pendingTap = null;
    this.refresh();
  }

  private clickAt(raw: Vec): void {
    if (this.mode.kind === "measure") {
      const hit = this.modelAt(raw);
      if (this.mode.from && !this.mode.to) {
        this.mode = {
          ...this.mode,
          to: hit
            ? { pos: hit.model.pos, elev: hit.model.elevation, unit: hit.unit.uid }
            : { pos: raw, elev: platformAt(this.state, raw) ? 1 : 0 },
        };
        this.refresh();
        return;
      }
      this.mode = hit
        ? {
            kind: "measure",
            from: hit.model.pos,
            fromElev: hit.model.elevation,
            fromUnit: hit.unit.uid,
          }
        : { kind: "measure", from: raw, fromElev: platformAt(this.state, raw) ? 1 : 0 };
      this.refresh();
      return;
    }
    this.closeDeployMenu();
    if (!this.humanTurn()) return;
    // Spots snap to the same 0.1" grid the hover preview checks, so what it showed is what happens.
    const p = snapPoint(raw);
    const s = this.state;
    const hit = this.modelAt(raw);
    const sel = this.sel();
    if (s.phase === "movement" && this.mode.kind === "none" && !sel && !hit) {
      const q = snapPoint(raw, 0.25);
      const here = this.deployableHere(q);
      if (here.length) {
        // A spot nothing can deploy to says why instead of opening an empty menu.
        const why = deploySpotProblem(s, here, q, here.length);
        if (why) this.reject(why);
        else this.openDeployMenu(q, deployChoices(s, HUMAN));
        return;
      }
    }

    if (this.mode.kind === "support") {
      const a = abilityOf(this.mode.support, this.mode.ability)!;
      const need = supportTarget(a);
      const base = {
        type: "support" as const,
        player: HUMAN as 0,
        support: this.mode.support,
        ability: this.mode.ability,
      };
      if (need === "friendlyUnit" && hit && hit.unit.owner === HUMAN) this.issue({ ...base, target: hit.unit.uid });
      else if (need === "enemyUnit" && hit && hit.unit.owner !== HUMAN) this.issue({ ...base, target: hit.unit.uid });
      else if (need === "point" && !hit) this.issue({ ...base, point: p });
      else if (need === "reservePoint" && !hit) {
        // A spot it can't land on says why straight away, instead of opening the unit menu.
        const bad = (a.effect.kind === "airdrop" ? airdropSpotProblem(s, HUMAN, a.effect, p) : null) ?? this.dropProblem(base, p);
        if (bad) this.reject(bad);
        else {
          this.openDeployMenu(p, droppableReserves(s, HUMAN), {
            title: `${a.name}: drop which unit?`,
            cmd: (u) => ({ ...base, target: u.uid, point: p }),
          });
        }
      } else if (need === "unitPoint") {
        // Two clicks: one of your units, then where it goes.
        if (hit && hit.unit.owner === HUMAN && !this.mode.unit) {
          const why = supportUnitProblem(s, HUMAN, base.support, base.ability, hit.unit);
          if (why) this.reject(why);
          else {
            this.mode = { ...this.mode, unit: hit.unit.uid };
            this.refresh();
          }
        } else if (this.mode.unit && !hit) this.issue({ ...base, target: this.mode.unit, point: p });
      }
      return;
    }
    if (this.mode.kind === "deploy" && this.deployUid) {
      if (!hit) this.issue({ type: "deploy", uid: this.deployUid, to: p });
      return;
    }
    if (this.mode.kind === "ability" && sel) {
      const def = ABILITIES[this.mode.id];
      if (def.needs === "enemyUnit") {
        if (hit && hit.unit.owner !== HUMAN)
          this.issue({ type: "ability", uid: sel.uid, ability: this.mode.id, target: hit.unit.uid });
        return;
      }
      if (def.needs === "friendlyUnit") {
        if (hit && hit.unit.owner === HUMAN)
          this.issue({
            type: "ability",
            uid: sel.uid,
            ability: this.mode.id,
            target: hit.unit.uid,
          });
        return;
      }
      if (def.needs === "friendlyUnitAndPoint" && !this.abilityTarget) {
        if (hit && hit.unit.owner === HUMAN && hit.unit.uid !== sel.uid) {
          const why = abilityUnitProblem(s, sel, this.mode.id, hit.unit);
          if (why) this.reject(why);
          else {
            this.abilityTarget = hit.unit.uid;
            this.refresh();
          }
        }
        return;
      }
      if (!hit || def.needs === "point") {
        this.issue({
          type: "ability",
          uid: sel.uid,
          ability: this.mode.id,
          point: p,
          target: this.abilityTarget ?? undefined,
        });
        return;
      }
    }
    if (hit && hit.unit.owner === HUMAN) {
      if (sel && hit.unit.uid === sel.uid) {
        this.leader = hit.model.id;
        this.refresh();
      } else if (eligibleUnits(s, HUMAN).includes(hit.unit)) {
        this.select(hit.unit, hit.model.id);
      } else {
        this.reject(actionProblem(s, hit.unit.uid, { kind: "hold" }) ?? "That unit can't act right now");
      }
      return;
    }
    const order = sel ? this.contextMode(sel, hit) : this.mode;
    if (hit && sel) {
      if (order.kind === "shoot") {
        const b = this.bestWeapon(sel, hit.unit, false);
        if (typeof b === "string") this.reject(b);
        else this.issue({ type: "shoot", uid: sel.uid, target: hit.unit.uid, weapon: b.index });
      } else if (order.kind === "charge") {
        this.issue({ type: "charge", uid: sel.uid, target: hit.unit.uid });
      } else if (order.kind === "fight") {
        const b = this.bestWeapon(sel, hit.unit, true);
        if (typeof b === "string") this.reject(b);
        else this.issue({ type: "fight", uid: sel.uid, target: hit.unit.uid, weapon: b.index });
      }
      return;
    }
    if (
      !hit &&
      sel &&
      this.leader !== null &&
      (order.kind === "move" || order.kind === "advance" || order.kind === "disengage")
    ) {
      this.issue({ type: order.kind, uid: sel.uid, leader: this.leader, to: p });
    }
  }

  /** A click that can't be carried out: a soft buzz and the reason, and nothing else changes. */
  private reject(why: string): void {
    audio.ui("error"); // [audio]
    this.flash(why);
  }

  private key(e: KeyboardEvent): void {
    if ((e.key === "m" || e.key === "M") && !e.ctrlKey && !e.metaKey) {
      this.toggleMeasure();
      return;
    }
    if ((e.key === "z" || e.key === "Z") && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      this.undo();
      return;
    }
    if (!this.humanTurn()) {
      if (e.key === "Escape" && this.mode.kind === "measure") {
        this.mode = { kind: "none" };
        this.refresh();
      }
      return;
    }
    const sel = this.sel();
    if (e.key === "Escape" && this.deployMenu) {
      this.closeDeployMenu();
      return;
    }
    if (e.key === "Escape") {
      this.clearSelection();
      this.refresh();
    } else if ((e.key === "h" || e.key === "H") && sel && this.state.phase !== "combat") {
      this.issue({ type: "hunker", uid: sel.uid });
    } else if (e.key === "p" || e.key === "P") {
      this.issue({ type: "pass", player: HUMAN });
    }
  }

  // ---------- commands ----------

  private issue(cmd: Command): boolean {
    // A board tap: the first one only previews a legal order; a second tap on the same spot or unit
    // carries out what was previewed.
    if (this.touchTap && !commandProblem(this.state, cmd)) {
      const pending = this.pendingTap;
      if (!pending || !sameOrder(pending, cmd, this.tapSlop())) {
        this.pendingTap = cmd;
        return false;
      }
      cmd = pending;
      this.hover = null;
    }
    this.pendingTap = null;
    const why = commandProblem(this.state, cmd);
    if (why) {
      this.reject(why);
      return false;
    }
    const r = applyCommand(this.state, cmd);
    if (!r.ok) {
      this.reject(r.error);
      return false;
    }
    const before = this.state;
    this.declareCommand(before, r.state, cmd);
    this.history.push(before);
    if (this.history.length > 60) this.history.shift();
    const keepUid = cmd.type === "ability" ? cmd.uid : undefined;
    const keepLeader = this.leader;
    this.clearSelection();
    const gen = this.generation;
    void this.present(before, r.state, r.events).then(() => {
      if (gen !== this.generation) return;
      // An ability is a free action inside the unit's activation: keep it selected for its main action.
      const keep = keepUid ? unitById(this.state, keepUid) : undefined;
      if (keep && eligibleUnits(this.state, HUMAN).includes(keep)) {
        this.select(keep, keep.models.some((m) => m.id === keepLeader && m.alive) ? (keepLeader ?? undefined) : undefined);
        return;
      }
      this.refresh();
      void this.runAi();
    });
    return true;
  }

  /** Take back your last command (and anything the AI did after it). Dice are seeded, so redoing it rolls the same. */
  private undo(): void {
    if (!this.humanTurn() || !this.history.length) return;
    this.state = this.history.pop()!;
    this.lastEvents = [];
    this.clearSelection();
    this.log("↶ Undid your last action.");
    this.refresh();
  }

  private toggleMeasure(): void {
    // Read the mode before clearSelection resets it, or the button could only ever turn measuring on.
    const measuring = this.mode.kind === "measure";
    this.clearSelection();
    this.mode = measuring ? { kind: "none" } : { kind: "measure" };
    this.refresh();
  }

  /** Narrate, log and mark up a batch of events (the presenter paces the batches and plays their sounds). */
  private handleEvents(before: GameState, events: GameEvent[]): void {
    this.narrate(before, events);
    const centre = (uid: string): Vec | null => {
      const u = unitById(this.state, uid) ?? unitById(before, uid);
      const ms = u ? u.models.filter((m) => m.alive) : [];
      const list = ms.length ? ms : (unitById(before, uid)?.models.filter((m) => m.alive) ?? []);
      if (!list.length) return null;
      return {
        x: list.reduce((s, m) => s + m.pos.x, 0) / list.length,
        y: list.reduce((s, m) => s + m.pos.y, 0) / list.length,
      };
    };
    for (const e of events) {
      const text = describeEvent(this.state, e);
      const owner =
        e.type === "attack"
          ? unitById(before, e.report.uid)?.owner
          : "uid" in e
            ? unitById(before, e.uid)?.owner
            : "player" in e
              ? e.player
              : undefined;
      if (text) this.log(text, owner);
      if (e.type === "attack") {
        const at = centre(e.report.target);
        if (at)
          this.renderer.floatText(
            at,
            e.report.unitDestroyed ? "KO!" : e.report.damage ? `-${e.report.damage}` : noHarmVerdict(e.report),
            e.report.damage ? 0xff6b6b : 0xffffff,
          );
      } else if (e.type === "scored") {
        // Over the objective it was scored for, when the reason names one.
        const n = /objective (\d+)/i.exec(e.reason)?.[1];
        const obj = n ? this.state.objectives.find((o) => o.number === Number(n)) : undefined;
        this.renderer.floatText(
          obj ? obj.pos : { x: this.state.board.width / 2, y: this.state.board.height / 2 + 2 },
          `${e.player === HUMAN ? "You" : "AI"} +${e.vp} VP`,
          e.player === HUMAN ? 0x2fb5c8 : 0xf0565b,
        );
      } else if (e.type === "gameOver") {
        setTimeout(() => this.showGameOver(), 900);
      }
    }
  }

  /** Queue an action's presentation (see `busy`). Resolves once it has played out. */
  private present(before: GameState, after: GameState, events: GameEvent[]): Promise<void> {
    const gen = this.generation;
    this.presenting = this.presenting.then(() => this.presentNow(before, after, events, gen));
    return this.presenting;
  }

  private async presentNow(before: GameState, after: GameState, events: GameEvent[], gen: number): Promise<void> {
    this.busy = true;
    this.refresh();
    try {
      // 1. The action itself: its sounds and dice first (yours wait for you to throw them), then the outcome.
      const cut = events.findIndex((e) => e.type === "phase" || e.type === "roundEnded");
      const action = cut < 0 ? events : events.slice(0, cut);
      const later = cut < 0 ? [] : events.slice(cut);
      audio.onGameEvents(action, after); // [audio] SFX, battle intensity, victory/defeat stinger
      await this.playAction(before, after, action, gen);
      if (gen !== this.generation) return;
      this.state = after;
      this.lastEvents = events;
      this.handleEvents(before, action);
      this.refresh();
      await this.alerts.idle();
      // The attack marker stays up through the dice and the outcome, then goes.
      if (this.mark) await sleep(350);
      if (gen !== this.generation) return;
      this.clearMark();
      // 2. What follows, one step at a time: phase banners, then the scoring walkthrough (each score,
      // healing, recharges, upkeep) with its own sound and call-out as it happens.
      for (const e of later) {
        if (gen !== this.generation) return;
        audio.onGameEvents([e], after);
        if (e.type === "phase") {
          await this.renderer.banner(`${PHASE_NAMES[e.phase]} phase`, { sub: PHASE_HINT[e.phase], kicker: `Round ${e.round}`, tone: "neutral" });
          continue;
        }
        await this.playDice([e]);
        this.handleEvents(before, [e]);
        this.walkthrough(e);
        await this.alerts.idle();
      }
      if (gen !== this.generation) return;
      // 3. Whose turn it is now.
      const s = this.state;
      if (!s.over && !s.orderChoice && before.activePlayer !== s.activePlayer) {
        await this.alerts.push(s.activePlayer === HUMAN ? "YOUR TURN!" : "AI'S TURN", {
          sub: `${PHASE_NAMES[s.phase]} phase`,
          tone: s.activePlayer === HUMAN ? "you" : "ai",
          ms: 1000,
        });
      }
    } finally {
      if (gen === this.generation) {
        this.busy = false;
        this.mark = null;
        this.refresh();
      }
    }
  }

  /**
   * An action's dice, one roll at a time. Before each attack's dice, the board shows who is attacking
   * whom and with what (see attackMark.ts), and holds it a moment so it can be read.
   */
  private async playAction(before: GameState, after: GameState, events: GameEvent[], gen: number): Promise<void> {
    const states = [before, after];
    // A blast from a support card comes from off the table: mark only what it hits.
    const card = events.find((e): e is Extract<GameEvent, { type: "support" }> => e.type === "support");
    if (this.mark) await this.holdDeclared();
    for (const e of events) {
      if (gen !== this.generation) return;
      if (e.type === "attack") {
        const r = e.report;
        const m = this.mark;
        const fromCard = r.kind === "barrage" && !!card;
        const uid = fromCard ? "" : r.uid;
        const same = !!m && m.uid === uid && m.target === r.target && m.kind === r.kind;
        if (!same) this.declare(uid, r.target, r.kind, r.weapon, states, fromCard ? card!.player : undefined);
        await this.holdDeclared();
      }
      await this.playDice([e]);
    }
  }

  /** Wait until the current marker has been on screen for the declare time. */
  private async holdDeclared(): Promise<void> {
    const m = this.mark;
    if (!m) return;
    const left = this.declareMs() - (performance.now() - m.at);
    if (left > 0) await sleep(left);
  }

  /** Shooting, fighting and charging commands put their marker up straight away (before any dice). */
  private declareCommand(before: GameState, after: GameState, cmd: Command): void {
    if (cmd.type !== "shoot" && cmd.type !== "fight" && cmd.type !== "charge") return;
    const u = unitById(before, cmd.uid);
    const weapon = cmd.type === "charge" || !u ? "" : (profileOf(u).weapons[cmd.weapon]?.name ?? "");
    this.declare(cmd.uid, cmd.target, cmd.type, weapon, [before, after]);
  }

  /** Call-outs for the end-of-round steps (scores have theirs in `narrate`). */
  private walkthrough(e: GameEvent): void {
    const s = this.state;
    const who = (p: number) => (p === HUMAN ? "You" : "AI");
    const tone = (p: number): AlertTone => (p === HUMAN ? "you" : "ai");
    if (e.type === "ability" && (e.ability === "regen" || e.ability === "regrow")) {
      const owner = unitById(s, e.uid)?.owner ?? HUMAN;
      void this.alerts.push(e.ability === "regrow" ? "REGROW!" : "REGEN!", { sub: e.text, tone: tone(owner), ms: 1000 });
    } else if (e.type === "rallied" && e.how === "roll") {
      const owner = unitById(s, e.uid)?.owner ?? HUMAN;
      void this.alerts.push("BACK IN THE FIGHT", { sub: `${unitName(s, e.uid)} shakes it off`, tone: tone(owner), ms: 1000 });
    } else if (e.type === "expired") {
      void this.alerts.push("POOF!", { sub: `${unitName(s, e.uid)} is gone`, tone: "neutral", ms: 900 });
    } else if (e.type === "recharged") {
      void this.alerts.push("SHIELDS UP", { sub: `${who(e.player)}: ${e.models} model${e.models === 1 ? "" : "s"} recharge`, tone: tone(e.player), ms: 900 });
    } else if (e.type === "upkeep") {
      const bits = [`+${e.resources} ⚙`, e.supply ? `+${e.supply} ◆ supply` : "", e.cp ? `+${e.cp} CP` : ""].filter(Boolean).join(" · ");
      void this.alerts.push(`${who(e.player).toUpperCase()}: SUPPLIES IN`, { sub: bits, tone: tone(e.player), ms: 1100 });
    } else if (e.type === "roundEnded") {
      void this.alerts.push(`ROUND ${e.round} DONE`, { sub: `You ${s.players[0].vp} VP · AI ${s.players[1].vp} VP`, tone: "neutral", big: true, ms: 1600 });
    }
  }

  private async runAi(): Promise<void> {
    if (!this.started || this.aiRunning || this.state.over || this.state.activePlayer !== AI) return;
    const gen = this.generation;
    this.aiRunning = true;
    this.refresh();
    try {
      while (!this.state.over && this.state.activePlayer === AI) {
        await this.presenting;
        await sleep(420);
        if (gen !== this.generation) return;
        const cmd = aiCommand(this.state);
        if ("uid" in cmd) this.selected = cmd.uid;
        let r = applyCommand(this.state, cmd);
        if (!r.ok) {
          console.error("AI command rejected", cmd, r.error);
          r = applyCommand(this.state, { type: "pass", player: AI });
          if (!r.ok) break;
        } else this.declareCommand(this.state, r.state, cmd);
        this.refresh();
        await sleep(200);
        if (gen !== this.generation) return;
        await this.present(this.state, r.state, r.events);
        if (gen !== this.generation) return;
        this.selected = null;
        this.refresh();
      }
    } finally {
      if (gen === this.generation) {
        this.aiRunning = false;
        this.selected = null;
        this.refresh();
      }
    }
  }

  // ---------- view ----------

  private refresh(): void {
    const s = this.state;
    const sel = this.sel();
    const hit = this.hover ? this.modelAt(this.hover) : undefined;
    const view: RenderView = {
      state: s,
      selected: this.selected,
      leader: this.leader,
      moveRing: null,
      ghosts: [],
      ghostOk: true,
      path: null,
      targets: [],
      sightLines: [],
      friendlyMarks: [],
      zone: null,
      blast: null,
      events: this.lastEvents,
      ready: eligibleUnits(s, s.activePlayer).map((u) => u.uid),
      attack: this.currentMark(),
      exhausted: s.phase === "movement" || s.phase === "assault" ? onBoard(s).filter((u) => u.status.disengaged).map((u) => u.uid) : [],
    };
    let cue: Cue | null = null;

    if (this.mode.kind === "measure") {
      cue = this.previewMeasure(hit, view);
    } else if (this.humanTurn()) {
      if (this.mode.kind === "deploy" && this.deployUid) {
        const u = unitById(s, this.deployUid);
        if (u) cue = this.previewDeploy(u, hit, view);
      } else if (this.mode.kind === "support") {
        cue = this.previewForSupport(this.mode.support, this.mode.ability, hit, view);
      } else if (sel) {
        cue = this.previewForSelected(sel, hit, view);
      } else {
        cue = this.previewIdle(hit);
      }
    }
    this.renderer.render(view);
    // While an attack is on screen, its label does the talking: no hover brief on top of it.
    if (!cue && hit && !this.deployMenu && !this.mark) cue = info(this.unitBrief(hit.unit));
    this.renderTooltip(this.deployMenu ? null : cue);
    this.renderer.setCursor(cursorCss(this.deployMenu || !this.hover ? "default" : cursorKindFor(cue)));
    this.renderAttackLabel();
    this.renderTopbar();
    this.renderCallout(sel);
    // Not while "who goes first?" is up: that choice comes first.
    const showPass = this.humanTurn() && !s.orderChoice;
    if (showPass && this.passBtn.hidden) this.passShownAt = performance.now();
    this.passBtn.hidden = !showPass;
    const canClaim =
      (s.phase === "movement" || s.phase === "combat") &&
      (s.initiativeClaim ?? null) === null &&
      !s.players[AI].passed &&
      eligibleUnits(s, HUMAN).length + (s.phase === "movement" ? reserves(s, HUMAN).length : 0) > 0;
    // Small screens drop the long tail (.pass-more) and touch screens the key hint (see hud.css).
    setHTML(
      this.passBtn,
      canClaim
        ? `⏭ Pass early<span class="pass-more">: lead the ${s.phase === "movement" ? "Assault phase" : "next round"}</span><span class="key-hint"> [P]</span>`
        : `⏭ Pass<span class="pass-more"> ${PHASE_NAMES[s.phase].toLowerCase()} phase</span><span class="key-hint"> [P]</span>`,
    );
    this.passBtn.title = canClaim
      ? "Stop acting this phase. Passing first claims the initiative: you go first in the next phase."
      : "Stop acting this phase.";
    this.renderOrderChoice();
    this.renderArmy();
    this.renderSupports();
    this.applyFactionAccents(hit?.unit ?? sel);
    this.renderCard(hit?.unit ?? sel ?? (this.deployUid ? unitById(s, this.deployUid) : undefined));
    this.renderActions(sel);
  }

  private previewMeasure(hit: { unit: Unit; model: Model } | undefined, view: RenderView): Cue {
    const m = this.mode;
    if (m.kind !== "measure") return info("");
    if (!m.from) return info("📏 Measuring: tap or click a model or a spot to measure from. Tap 📏 Measure again (or M, Esc) to stop.", "pointer");
    const s = this.state;
    const pinned = m.to;
    if (!pinned && !this.hover) return info("📏 Point at, or tap, where to measure to.");
    const hitTo = pinned ? (pinned.unit ? { unit: unitById(s, pinned.unit)! } : undefined) : hit;
    const to = pinned ? pinned.pos : hit ? hit.model.pos : this.hover!;
    const toElev = pinned ? pinned.elev : hit ? hit.model.elevation : platformAt(s, to) ? 1 : 0;
    const fromElev = (m.fromElev ?? 0) as 0 | 1 | 2;
    const sight = lineOfSight(s, m.from, fromElev, to, toElev as 0 | 1 | 2);
    view.sightLines = [{ from: m.from, to, ok: sight }];
    const d = dist(m.from, to);
    const fromUnit = m.fromUnit ? unitById(s, m.fromUnit) : undefined;
    const edge =
      (fromUnit ? profileOf(fromUnit).baseRadius : 0) + (hitTo ? profileOf(hitTo.unit).baseRadius : 0);
    const parts = [`📏 ${d.toFixed(1)}"`];
    if (edge > 0) parts.push(`edge to edge ${Math.max(0, d - edge).toFixed(1)}"`);
    parts.push(sight ? "sight: clear" : "sight: blocked");
    if (pinned) parts.push("tap again to measure from somewhere else");
    return info(parts.join(" · "), "pointer");
  }

  /** Nothing selected: say what a click on this spot or unit would do. */
  private previewIdle(hit: { unit: Unit; model: Model } | undefined): Cue | null {
    const s = this.state;
    if (hit) {
      const name = profileOf(hit.unit).name;
      if (hit.unit.owner !== HUMAN) return null; // the unit brief
      const why = actionProblem(s, hit.unit.uid, { kind: "hold" });
      return why ? bad(`${name}: ${why}`) : info(`${name}: click to activate`, "pointer");
    }
    if (!this.hover || s.phase !== "movement") return null;
    // Empty ground in the movement phase: can something deploy here?
    const p = snapPoint(this.hover, 0.25);
    const here = this.deployableHere(p);
    if (!here.length) return null;
    const why = deploySpotProblem(s, here, p, here.length);
    return why ? bad(why) : ok(`${s.openRoster ? "Recruit" : "Deploy"} here: click to pick a unit`, "place");
  }

  /** Units that could deploy at `p` going by zone and cost (cheapest and smallest first). */
  private deployableHere(p: Vec): Unit[] {
    const s = this.state;
    return deployChoices(s, HUMAN)
      .filter((u) => deployZones(s, u).some((poly) => pointInZone(p, poly)))
      .sort((a, b) => profileOf(a).models - profileOf(b).models || profileOf(a).cost - profileOf(b).cost);
  }

  private previewDeploy(u: Unit, hit: { unit: Unit; model: Model } | undefined, view: RenderView): Cue | null {
    const s = this.state;
    view.zone = deployZones(s, u);
    if (!this.hover) return null;
    if (hit) return bad("That spot is taken: pick open ground");
    const p = snapPoint(this.hover);
    const why = commandProblem(s, { type: "deploy", uid: u.uid, to: p });
    const r = profileOf(u).baseRadius;
    const plan = planUnitMove(s, u, u.models[0]!.id, p, { allowance: 0, teleport: true, zone: view.zone });
    if (why) {
      view.ghosts = typeof plan === "string" ? [{ pos: p, radius: r }] : plan.placements.map((at) => ({ pos: at.pos, radius: r }));
      view.ghostOk = false;
      return bad(why);
    }
    if (typeof plan !== "string") view.ghosts = plan.placements.map((at) => ({ pos: at.pos, radius: r, cover: coverRating(s, u, at.pos, at.elevation) }));
    return ok(`Deploy ${profileOf(u).name} here`, "place");
  }

  private previewForSupport(
    supportId: string,
    abilityId: string,
    hit: { unit: Unit; model: Model } | undefined,
    view: RenderView,
  ): Cue | null {
    const s = this.state;
    const a = abilityOf(supportId, abilityId)!;
    const need = supportTarget(a);
    const base = { type: "support" as const, player: HUMAN as 0, support: supportId, ability: abilityId };
    const picked = need === "unitPoint" && this.mode.kind === "support" && this.mode.unit ? unitById(s, this.mode.unit) : undefined;
    const hp = this.hover ? snapPoint(this.hover) : null;
    const why = picked ? canPlaySupport(s, HUMAN, supportId, abilityId) : supportProblem(s, HUMAN, supportId, abilityId);
    if (why) return bad(`${a.name}: ${why}`);

    if (need === "friendlyUnit" || need === "enemyUnit") {
      const pool = need === "friendlyUnit" ? onBoard(s, HUMAN) : onBoard(s, AI);
      const checks = checkTargets(s, pool, (t) => ({ ...base, target: t.uid }));
      if (need === "friendlyUnit") view.friendlyMarks = checks.filter((c) => !c.problem).map((c) => c.uid);
      else view.targets = checks.map((c) => ({ uid: c.uid, ok: !c.problem }));
      if (hit) {
        const mine = hit.unit.owner === HUMAN;
        if (mine !== (need === "friendlyUnit")) return bad(`${a.name}: pick ${need === "friendlyUnit" ? "one of your units" : "an enemy unit"}`);
        const p = checks.find((c) => c.uid === hit.unit.uid)?.problem ?? null;
        return p ? bad(`${a.name}: ${p}`) : ok(`${a.name}: ${profileOf(hit.unit).name}`, need === "enemyUnit" ? "target" : "go");
      }
      return info(`${a.name} (${a.cp} CP): click ${need === "friendlyUnit" ? "one of your marked units" : "an enemy unit"}. Esc cancels.`);
    }

    if (need === "point") {
      const e = a.effect;
      const radius =
        e.kind === "blast" ? e.radius : e.kind === "summon" ? profileFor(e.profileId, []).baseRadius : 1;
      if (hp && !hit) {
        const p = commandProblem(s, { ...base, point: hp });
        // A blast shows its area; a summoned structure shows its base, green or red.
        if (e.kind === "summon") {
          view.ghosts = [{ pos: hp, radius }];
          view.ghostOk = !p;
        } else view.blast = { center: hp, radius };
        return p ? bad(`${a.name}: ${p}`) : ok(`${a.name}: here`, e.kind === "blast" ? "target" : "place");
      }
      if (hit) return bad(`${a.name}: pick a spot on open ground`);
      return info(`${a.name} (${a.cp} CP): click a spot on the board. Esc cancels.`);
    }

    if (need === "reservePoint" && a.effect.kind === "airdrop") {
      // Red rings where it can't land; the spot under the pointer is checked against the real drop.
      view.noGo = airdropNoGo(s, HUMAN, a.effect);
      if (!hp) return info(`${a.name} (${a.cp} CP): click a spot, then pick a reserve unit to drop there. Esc cancels.`);
      if (hit) return bad(`${a.name}: that spot is taken`);
      const spot = airdropSpotProblem(s, HUMAN, a.effect, hp);
      const r = 1;
      if (spot) {
        view.ghosts = [{ pos: hp, radius: r }];
        view.ghostOk = false;
        return bad(`${a.name}: ${spot}`);
      }
      const p = this.dropProblem(base, hp);
      view.ghosts = [{ pos: hp, radius: r }];
      view.ghostOk = !p;
      return p ? bad(`${a.name}: ${p}`) : ok(`${a.name}: drop here (click, then pick a unit)`, "place");
    }

    if (need === "unitPoint" && a.effect.kind === "teleport") {
      if (!picked) {
        view.friendlyMarks = onBoard(s, HUMAN).filter((u) => !supportUnitProblem(s, HUMAN, supportId, abilityId, u)).map((u) => u.uid);
        if (hit) {
          if (hit.unit.owner !== HUMAN) return bad(`${a.name}: pick one of your units`);
          const p = supportUnitProblem(s, HUMAN, supportId, abilityId, hit.unit);
          return p ? bad(`${a.name}: ${p}`) : ok(`${a.name}: move ${profileOf(hit.unit).name}`, "pointer");
        }
        return info(`${a.name} (${a.cp} CP): click one of your units, then where it goes. Esc cancels.`);
      }
      const lead = aliveModels(picked)[0];
      if (lead) view.moveRing = { center: lead.pos, radius: a.effect.range };
      if (hp && !hit && lead) {
        const p = commandProblem(s, { ...base, target: picked.uid, point: hp });
        const plan = planUnitMove(s, picked, lead.id, hp, { allowance: 0, teleport: true });
        const r = profileOf(picked).baseRadius;
        view.ghosts = typeof plan === "string" ? [{ pos: hp, radius: r }] : plan.placements.map((at) => ({ pos: at.pos, radius: r, cover: p ? undefined : coverRating(s, picked, at.pos, at.elevation) }));
        view.ghostOk = !p;
        return p ? bad(`${a.name}: ${p}`) : ok(`${a.name}: move ${profileOf(picked).name} here`);
      }
      return info(`${a.name}: click where ${profileOf(picked).name} goes. Esc cancels.`);
    }
    return info(`${a.name} (${a.cp} CP). Esc cancels.`);
  }

  /** Can any reserve unit be dropped at `p` by this support? Null if so, else the first reason. Cached per state. */
  private dropProblem(base: { type: "support"; player: 0; support: string; ability: string }, p: Vec): string | null {
    const s = this.state;
    const units = droppableReserves(s, HUMAN)
      .filter((u) => canAffordDeploy(s, u) === null)
      .sort((a, b) => profileOf(a).models - profileOf(b).models || profileOf(a).baseRadius - profileOf(b).baseRadius);
    let first: string | null = null;
    for (const u of units.slice(0, 4)) {
      const why = commandProblem(s, { ...base, target: u.uid, point: p });
      if (!why) return null;
      first ??= why;
    }
    return first ?? "No reserve unit you can afford";
  }

  private renderSupports(): void {
    const s = this.state;
    const el = this.els.sidebar.querySelector("#supports");
    if (!el) return;
    const me = s.players[HUMAN];
    const ai = s.players[AI];
    const cards = me.supports
      .map((c) => {
        const def = supportOf(c.id);
        const buttons = def.abilities
          .map((a) => {
            const why = this.humanTurn() ? supportProblem(s, HUMAN, c.id, a.id) : "Wait for your turn";
            const on =
              this.mode.kind === "support" &&
              this.mode.support === c.id &&
              this.mode.ability === a.id;
            const when = a.timing === "any" ? "any phase" : `${PHASE_NAMES[a.timing]}`;
            return `<button class="mini support-btn ${on ? "selected" : ""}" data-support="${esc(c.id)}" data-sab="${esc(a.id)}" ${buttonAttrs(why ? `${why}. ${a.text}` : null, a.text)}>
              ${esc(a.name)} <small>${a.cp} CP · ${esc(when)}${a.exhaust ? " · exhausts" : ""}</small>${whyLine(why)}</button>`;
          })
          .join("");
        return `<div class="support-card ${c.exhausted ? "exhausted" : ""}">
          <div class="support-head"><b>${esc(def.name)}</b> <small>+${def.cp} CP/round${c.exhausted ? " · exhausted" : ""}</small></div>
          <div class="support-abilities">${buttons}</div>
        </div>`;
      })
      .join("");
    const armed = me.armed
      .map(
        (a) =>
          `<span class="tag">⚡ ${esc(abilityOf(a.support, a.ability)?.name ?? a.ability)}</span>`,
      )
      .join("");
    const html = `
      <h3 style="margin:0 0 4px">${factionEmblemSvg(s.factions[HUMAN], 22)} Supports <span class="chip cp">✦ ${me.cp}/${CP_CAP} CP</span> <small class="hint">+${cpPerRound(me.supports)}/round</small></h3>
      ${cards || `<p class="hint">No supports in this list.</p>`}
      ${armed ? `<div class="tags">Armed: ${armed}</div>` : ""}
      <p class="hint" style="margin:4px 0 0">AI: ✦ ${ai.cp} CP${ai.armed.length ? ` · ${ai.armed.length} reaction${ai.armed.length > 1 ? "s" : ""} armed` : ""}</p>`;
    const holder = el as HTMLElement & { __html?: string };
    if (holder.__html === html) return;
    holder.__html = html;
    el.innerHTML = html;
    el.querySelectorAll<HTMLButtonElement>("button[data-support]").forEach((b) =>
      b.addEventListener("click", () => {
        const support = b.dataset.support!;
        const ability = b.dataset.sab!;
        const a = abilityOf(support, ability)!;
        if (supportTarget(a) === "none") {
          this.issue({ type: "support", player: HUMAN as 0, support, ability });
          return;
        }
        // Pressing the armed card again puts it away (no Esc key on a touch screen).
        const on = this.mode.kind === "support" && this.mode.support === support && this.mode.ability === ability;
        this.clearSelection();
        if (!on) this.mode = { kind: "support", support, ability };
        this.refresh();
      }),
    );
  }

  private previewForSelected(
    sel: Unit,
    hit: { unit: Unit; model: Model } | undefined,
    view: RenderView,
  ): Cue | null {
    const s = this.state;
    const r = profileOf(sel).baseRadius;
    const leader = sel.models.find((m) => m.id === this.leader && m.alive) ?? aliveModels(sel)[0];
    const mode = this.contextMode(sel, hit);
    if (!leader) return null;
    const hp = this.hover ? snapPoint(this.hover) : null;
    // Pointing at your own units: pick a leader, or switch to another unit.
    const own = hit && hit.unit.owner === HUMAN ? hit.unit : undefined;
    const ownCue = (): Cue | null => {
      if (!own) return null;
      if (own.uid === sel.uid) return info("Click to make this model the leader (★)", "pointer");
      const why = actionProblem(s, own.uid, { kind: "hold" });
      return why ? bad(`${profileOf(own).name}: ${why}`) : info(`Switch to ${profileOf(own).name}`, "pointer");
    };

    if (mode.kind === "move" || mode.kind === "advance" || mode.kind === "disengage") {
      const mv = effectiveMove(s, sel);
      view.moveRing = { center: leader.pos, radius: mv };
      if (hit) return ownCue() ?? bad(s.phase === "movement" ? "Enemies are attacked in the assault phase" : "Pick open ground to move to");
      if (!hp) return null;
      const pre = actionProblem(s, sel.uid, { kind: mode.kind });
      if (pre) return bad(pre);
      const why = commandProblem(s, { type: mode.kind, uid: sel.uid, leader: leader.id, to: hp });
      const plan = planUnitMove(s, sel, leader.id, hp, { allowance: mv });
      if (typeof plan === "string") {
        view.ghosts = [{ pos: hp, radius: r }];
        view.ghostOk = false;
        return bad(why ?? plan);
      }
      view.ghosts = plan.placements.map((p) => ({ pos: p.pos, radius: r, cover: why ? undefined : coverRating(s, sel, p.pos, p.elevation) }));
      const route = planRoute(s, sel, leader.pos, leader.elevation, hp);
      if (typeof route !== "string") view.path = [route.legs[0]!.from, ...route.legs.map((l) => l.to)];
      if (why) {
        view.ghostOk = false;
        return bad(why);
      }
      const verb = mode.kind === "advance" ? "Advance" : mode.kind === "disengage" ? "Disengage" : "Move";
      const via = plan.via ? " via " + (plan.via.includes("ladder") ? "ladder" : "ramp") : "";
      const odds = mode.kind === "disengage" ? ` · ${disengageText(s, sel)}` : "";
      return ok(`${verb} ${plan.leaderDistance.toFixed(1)}" of ${mv}"${via}${odds}`);
    }

    if (mode.kind === "shoot" || mode.kind === "fight") {
      const melee = mode.kind === "fight";
      const pool = melee ? engagedWith(s, sel) : onBoard(s, AI);
      for (const e of pool) view.targets.push({ uid: e.uid, ok: typeof this.bestWeapon(sel, e, melee) !== "string" });
      if (own) return ownCue();
      if (hit && hit.unit.owner !== HUMAN) {
        const b = this.bestWeapon(sel, hit.unit, melee);
        if (typeof b === "string") {
          // Still draw the aim lines with the longest-reaching gun, so you can see what's in the way or how far short it falls.
          if (!melee) {
            const gun = profileOf(sel)
              .weapons.filter((x) => !x.melee && rangedCanHit(x, hit.unit))
              .sort((x, y) => y.range - x.range)[0];
            if (gun) {
              const why = this.aimLines(view, sel, hit.unit, gun, null);
              return bad(why.length ? `${b} · ${why.join(" · ")}` : b);
            }
          }
          return bad(b);
        }
        const w = profileOf(sel).weapons[b.index]!;
        const terrain = melee ? [] : this.aimLines(view, sel, hit.unit, w, new Set(b.plan.attackers.map((a) => a.model)));
        const dice = b.plan.attackers.reduce((n, a) => n + a.dice, 0);
        const exp = expectedDamage(s, sel, hit.unit, b.plan, melee);
        // What stands between a hit and a wound, so armour and dodges don't read as bad luck.
        const tm = b.plan.targets[0]!;
        const from = b.plan.attackers.reduce((x, y) => (dist(y.model.pos, tm.pos) < dist(x.model.pos, tm.pos) ? y : x)).model;
        const save = saveNeeded(s, sel, hit.unit, tm, b.plan.ap, melee, from);
        const evade = b.plan.evadeOn === undefined ? evadeTarget(hit.unit, melee ? ["melee"] : ["ranged"]) : b.plan.evadeOn;
        const defence = `${evade ? `they dodge on ${evade}+${b.plan.tracking ? ` (tracking ${b.plan.tracking})` : ""}, ` : ""}${save === null ? "no save" : `save on ${save}+`}`;
        return ok(
          `${melee ? "⚔ Fight" : "🎯 Shoot"} with ${w.name}: ${b.plan.attackers.length} model${b.plan.attackers.length > 1 ? "s" : ""}, ${dice} ${dice === 1 ? "die" : "dice"} hitting on ${b.plan.hitOn}+ · AP${b.plan.ap} · ${defence} · ≈${exp.toFixed(1)} damage${terrain.length ? ` · ${terrain.join(" · ")}` : ""}`,
          "target",
        );
      }
      if (hp && !hit && !melee && s.phase === "assault") {
        const adv = actionProblem(s, sel.uid, { kind: "advance" });
        if (this.mode.kind === "auto") return adv ? bad(adv) : null;
      }
      return null;
    }

    if (mode.kind === "charge") {
      const mv = effectiveMove(s, sel);
      view.moveRing = { center: leader.pos, radius: mv + r };
      for (const c of actionTargets(s, sel.uid, { kind: "charge" })) view.targets.push({ uid: c.uid, ok: !c.problem });
      if (own) return ownCue();
      if (hit && hit.unit.owner !== HUMAN) {
        const why = commandProblem(s, { type: "charge", uid: sel.uid, target: hit.unit.uid });
        // In auto mode, a target nobody can shoot or charge: say why it can't be shot as well.
        if (why) return bad(this.mode.kind === "auto" ? `${why} (and ${this.shootReason(sel, hit.unit)})` : why);
        const plan = planCharge(s, sel, hit.unit);
        if (typeof plan !== "string") view.ghosts = plan.placements.map((p) => ({ pos: p.pos, radius: r }));
        return ok(
          `💥 Charge ${profileOf(hit.unit).name}${typeof plan === "string" ? "" : ` (${plan.leaderDistance.toFixed(1)}")`}. Chargers get +1 die per model in combat.`,
          "target",
        );
      }
      const pre = actionProblem(s, sel.uid, { kind: "charge" });
      return pre ? bad(pre) : info(`Click a marked enemy within ${mv}" to charge`);
    }

    if (mode.kind === "ability") {
      const def = ABILITIES[mode.id];
      const pre = actionProblem(s, sel.uid, { kind: "ability", id: mode.id });
      if (pre) return bad(`${def.name}: ${pre}`);
      if (def.needs === "enemyUnit" || def.needs === "friendlyUnit") {
        const checks = actionTargets(s, sel.uid, { kind: "ability", id: mode.id });
        if (def.needs === "enemyUnit") {
          view.moveRing = { center: leader.pos, radius: (def.range ?? 0) + r };
          view.targets = checks.map((c) => ({ uid: c.uid, ok: !c.problem }));
        } else view.friendlyMarks = checks.filter((c) => !c.problem).map((c) => c.uid);
        if (hit) {
          const wantEnemy = def.needs === "enemyUnit";
          if ((hit.unit.owner !== HUMAN) !== wantEnemy) return bad(`${def.name}: pick ${wantEnemy ? "an enemy unit" : "a friendly unit"}`);
          const p = checks.find((c) => c.uid === hit.unit.uid)?.problem ?? null;
          return p ? bad(`${def.name}: ${p}`) : ok(`${def.name}: ${profileOf(hit.unit).name}`, wantEnemy ? "target" : "go");
        }
        return info(`${def.name}: click ${def.needs === "enemyUnit" ? "a marked enemy" : "a marked friendly unit"}${def.range ? ` within ${def.range}"` : ""}`);
      }
      if (def.needs === "friendlyUnitAndPoint" && !this.abilityTarget) {
        const friends = onBoard(s, HUMAN).filter((f) => f.uid !== sel.uid);
        view.friendlyMarks = friends.filter((f) => !abilityUnitProblem(s, sel, mode.id, f)).map((f) => f.uid);
        if (hit) {
          if (hit.unit.owner !== HUMAN) return bad(`${def.name}: pick a friendly unit`);
          if (hit.unit.uid === sel.uid) return bad(`${def.name}: pick another friendly unit`);
          const p = abilityUnitProblem(s, sel, mode.id, hit.unit);
          return p ? bad(`${def.name}: ${p}`) : ok(`${def.name}: bring ${profileOf(hit.unit).name} over`, "pointer");
        }
        return info(`${def.name}: click a marked friendly unit to bring over`);
      }
      // Spot-picking abilities: Barrage, Blink, Tunnel, Rocket Hop, and Recall's second click.
      const mover = mode.id === "recall" && this.abilityTarget ? unitById(s, this.abilityTarget) ?? sel : sel;
      if (mode.id === "barrage") view.moveRing = { center: leader.pos, radius: def.range ?? 24 };
      if (mode.id === "blink" || mode.id === "rocket-hop") view.moveRing = { center: leader.pos, radius: def.range ?? 10 };
      if (mode.id === "recall") view.moveRing = { center: leader.pos, radius: 4 + r };
      if (!hp) return info(def.text);
      if (hit && mode.id !== "barrage") return bad(`${def.name}: pick open ground`);
      const why = commandProblem(s, { type: "ability", uid: sel.uid, ability: mode.id, point: hp, target: this.abilityTarget ?? undefined });
      if (mode.id === "barrage") {
        view.blast = { center: hp, radius: 2 };
        return why ? bad(`${def.name}: ${why}`) : ok("Barrage: hits every ground model under the blast, yours too", "target");
      }
      const mr = profileOf(mover).baseRadius;
      const plan = planUnitMove(s, mover, aliveModels(mover)[0]!.id, hp, { allowance: 0, teleport: true });
      view.ghosts = typeof plan === "string" ? [{ pos: hp, radius: mr }] : plan.placements.map((p) => ({ pos: p.pos, radius: mr, cover: why ? undefined : coverRating(s, mover, p.pos, p.elevation) }));
      view.ghostOk = !why;
      return why ? bad(`${def.name}: ${why}`) : ok(`${def.name}: click to go here`);
    }
    if (mode.kind === "none") {
      if (own) return ownCue();
      if (hit && s.phase === "movement") return bad("Enemies are attacked in the assault phase");
      if (hp && !hit && s.phase === "assault") {
        const adv = actionProblem(s, sel.uid, { kind: "advance" });
        if (adv) return bad(adv);
      }
    }
    return null;
  }

  /** Why `a` can't shoot `t` with any ranged weapon (for the auto-order tip). */
  private shootReason(a: Unit, t: Unit): string {
    const b = this.bestWeapon(a, t, false);
    return typeof b === "string" ? b.charAt(0).toLowerCase() + b.slice(1) : "it can be shot";
  }

  private renderTooltip(cue: Cue | null): void {
    if (!cue || !cue.text || !this.hover) {
      this.tooltip.style.display = "none";
      return;
    }
    const sp = this.renderer.toScreen(this.hover);
    this.tooltip.style.display = "block";
    this.tooltip.className = `tooltip cue-${cue.tone}`;
    const glyph = toneGlyph(cue.tone);
    // A tapped order waiting for its second tap says so.
    const confirm = this.touchHover && this.pendingTap && cue.tone === "ok" ? `<b class="cue-confirm">Tap again to confirm</b>` : "";
    this.tooltip.innerHTML = `${glyph ? `<b class="cue-glyph" aria-hidden="true">${glyph}</b>` : ""}<span>${esc(cue.text)}${confirm}</span>`;
    const maxX = this.els.stage.clientWidth - 270;
    this.tooltip.style.left = `${Math.max(4, Math.min(maxX, sp.x + 20))}px`;
    // Kept on the board: below the spot, or above it near the bottom edge.
    const h = this.tooltip.offsetHeight;
    const below = sp.y + 20;
    this.tooltip.style.top = `${below + h > this.els.stage.clientHeight - 4 ? Math.max(4, sp.y - h - 16) : below}px`;
  }

  // ---------- attack markers ----------

  /** The attack marker to draw now, from the current state (falling back to the states around the action). */
  private currentMark(): AttackMarkView | null {
    const m = this.mark;
    if (!m) return null;
    return markFor([this.state, ...m.states], m.uid, m.target, m.kind, m.owner);
  }

  /** Show who is attacking whom (and with what) until `clearMark`. */
  private declare(uid: string, target: string, kind: AttackKind, weapon: string, states: GameState[], owner?: number): void {
    this.mark = { uid, target, kind, weapon, states, owner, at: performance.now() };
    this.refresh();
  }

  private clearMark(): void {
    if (!this.mark) return;
    this.mark = null;
    this.refresh();
  }

  /** How long a declared attack sits on screen before its dice roll. */
  private declareMs(): number {
    return this.tray.speed === "quick" ? 450 : 750;
  }

  private renderAttackLabel(): void {
    const m = this.mark;
    const view = m ? this.currentMark() : null;
    if (!m || !view) {
      this.markEl.hidden = true;
      return;
    }
    const ends = arrowEnds(view.from, view.to);
    const at = ends ? { x: (ends.a.x + ends.b.x) / 2, y: (ends.a.y + ends.b.y) / 2 } : centroid(view.to);
    const sp = this.renderer.toScreen(at);
    const side = (m.owner ?? markSide([this.state, ...m.states], m.uid)) === HUMAN ? "p0" : "p1";
    const names = m.uid ? `${unitName(this.state, m.uid)} → ${unitName(this.state, m.target)}` : `→ ${unitName(this.state, m.target)}`;
    const html = `<b>${esc(attackLabel(m.kind, m.weapon))}</b><span>${esc(names)}</span>`;
    setHTML(this.markEl, html);
    this.markEl.className = `attack-label ${side}`;
    this.markEl.hidden = false;
    const w = this.markEl.offsetWidth;
    const h = this.markEl.offsetHeight;
    const stage = this.els.stage;
    this.markEl.style.left = `${Math.max(6, Math.min(stage.clientWidth - w - 6, sp.x - w / 2))}px`;
    this.markEl.style.top = `${Math.max(6, Math.min(stage.clientHeight - h - 6, sp.y - h - 14))}px`;
  }

  private renderTopbar(): void {
    const s = this.state;
    const phases = (["movement", "assault", "combat", "scoring"] as const)
      .map((p) => `<span class="phase ${s.phase === p ? "current" : ""}">${PHASE_NAMES[p]}</span>`)
      .join("");
    const status = s.over
      ? "Game over"
      : !this.started
        ? "Rolling for initiative…"
      : this.busy
        ? "Resolving…"
      : s.orderChoice
        ? s.orderChoice.player === HUMAN
          ? "Choose who goes first"
          : "The AI is choosing who goes first…"
      : this.aiRunning || s.activePlayer === AI
        ? "AI is thinking…"
        : s.phase === "movement"
          ? "Your move: deploy, move or hunker"
          : s.phase === "assault"
            ? "Your assault: shoot, charge or advance"
            : "Combat: pick an engaged unit to fight";
    const changed = setHTML(
      this.els.topbar,
      `
      <span class="logo" aria-label="SCDMG">${wordmarkSvg(true)}</span>
      <span class="chip">Round ${s.round}/${s.maxRounds}</span>
      <span class="phases">${phases}</span>
      <span class="score">
        <span class="chip p0 ${s.activePlayer === HUMAN && !s.over ? "active" : ""}">You ${s.players[0].vp}</span>
        <span class="chip p1 ${s.activePlayer === AI && !s.over ? "active" : ""}">AI ${s.players[1].vp}</span>
        <small class="mercy" title="A lead of more than ${mercyLead(s)} VP wins the game on the spot">lead by ${mercyLead(s) + 1}+ VP wins</small>
      </span>
      <span class="status">${esc(status)}</span>
      <span class="spacer"></span>
      <button class="secondary" id="btn-fit" title="Fit the board to the screen (0)">⤢ Fit</button>
      <button class="secondary ${this.mode.kind === "measure" ? "selected" : ""}" id="btn-measure" aria-pressed="${this.mode.kind === "measure"}" title="${this.mode.kind === "measure" ? "Stop measuring (M or Esc)" : "Measure distances and check line of sight (M)"}">📏 Measure</button>
      <button class="secondary" id="btn-undo" ${this.humanTurn() && this.history.length ? "" : "disabled"} title="Take back your last action (Ctrl+Z)">↶ Undo</button>
      <button class="secondary" id="btn-dice" title="Dice: Throw (you throw your own dice), Auto, Quick or Off">🎲 Dice: ${DICE_SPEED_LABEL[this.tray.speed]}</button>
      <span id="audio-slot"></span>
      <button class="secondary" id="btn-rules">How to play</button>
      ${
        this.hooks.campaign
          ? `<button class="${s.over ? "" : "secondary"}" id="btn-new" title="${s.over ? "Take the result back to the campaign map" : "Leave this battle: it counts as a defeat"}">${s.over ? "⚔ Back to the campaign" : "⚑ Retreat"}</button>`
          : `<button class="secondary" id="btn-new">New game</button>`
      }`,
    );
    if (!changed) return;
    audio.mountButton(this.els.topbar.querySelector("#audio-slot")); // [audio]
    this.els.topbar
      .querySelector("#btn-measure")!
      .addEventListener("click", () => this.toggleMeasure());
    this.els.topbar.querySelector("#btn-undo")!.addEventListener("click", () => this.undo());
    this.els.topbar.querySelector("#btn-fit")!.addEventListener("click", () => this.renderer.resetView());
    this.els.topbar.querySelector("#btn-rules")!.addEventListener("click", () => showRules());
    this.els.topbar.querySelector("#btn-dice")!.addEventListener("click", () => this.cycleDice());
    this.els.topbar.querySelector("#btn-new")!.addEventListener("click", () => (this.hooks.campaign ? this.leaveCampaignBattle() : this.onNewGame()));
  }

  private resultSent = false;

  /** Campaign: report the result once (a retreat mid-battle counts as a defeat). */
  private reportResult(retreated: boolean): void {
    const c = this.hooks.campaign;
    if (!c || this.resultSent) return;
    this.resultSent = true;
    const s = this.state;
    c.onResult({ winner: retreated ? AI : s.winner, vp: [s.players[0].vp, s.players[1].vp], retreated });
  }

  private leaveCampaignBattle(): void {
    if (this.state.over) return this.reportResult(false);
    if (!confirm("Retreat from this battle? It counts as a defeat in the campaign.")) return;
    this.reportResult(true);
  }

  private renderArmy(): void {
    const s = this.state;
    const el = this.els.sidebar.querySelector("#army")!;
    const me = s.players[HUMAN];
    const ai = s.players[AI];
    const why = (u: Unit): string | null =>
      this.humanTurn() ? actionProblem(s, u.uid, { kind: "deploy" }) : s.over ? "The game is over" : "Wait for your turn";
    const rows = reserveRowsHtml(s, HUMAN, why, this.deployUid);
    const changed = setHTML(
      el,
      `
      <div class="army-row"><span class="chip p0">You</span> ⚙ ${me.resources} · ◆ ${supplyUsed(s, HUMAN)}/${me.supplyCap} supply</div>
      <div class="army-row"><span class="chip p1">AI</span> ⚙ ${ai.resources} · ◆ ${supplyUsed(s, AI)}/${ai.supplyCap} supply · ${aiReserveText(s, AI)}</div>
      ${rows ? `<h3 style="margin-top:6px">${reservesHeading(s)}</h3>${rows}` : `<p class="hint">Everything is deployed.</p>`}`,
    );
    if (!changed) return;
    el.querySelectorAll<HTMLButtonElement>("button[data-deploy]").forEach((b) =>
      b.addEventListener("click", () => {
        this.clearSelection();
        this.deployUid = b.dataset.deploy!;
        this.mode = { kind: "deploy" };
        this.refresh();
      }),
    );
  }

  private renderCard(u: Unit | undefined): void {
    const el = this.els.sidebar.querySelector("#card")!;
    const s = this.state;
    if (!u) {
      setHTML(
        el,
        `<h3>No unit selected</h3><p class="hint">Click one of your units to activate it, or deploy from reserves. Hover (or tap) anything to inspect it.</p>`,
      );
      return;
    }
    const p = profileOf(u);
    const alive = aliveModels(u).length;
    const statuses = [
      u.status.acted && "acted",
      u.onBoard && isEngaged(s, u) && "engaged",
      u.status.hunkered && "hunkered",
      u.status.charged && "charged",
      u.status.disengaged && "😮‍💨 exhausted (disengaged)",
      u.status.slowedRounds > 0 && "slowed",
      u.status.shaken && "😱 shaken",
      !u.onBoard && "in reserve",
    ].filter(Boolean);
    const rallyWhy = u.status.shaken && u.owner === HUMAN && this.humanTurn() ? commandProblem(s, { type: "rally", player: HUMAN as 0, target: u.uid }) : "no";
    const canRally = rallyWhy === null;
    const fearless = !!p.structure || p.keywords.includes("fearless");
    const changed = setHTML(
      el,
      `
      <h3>${esc(p.name)} <span class="chip ${u.owner === HUMAN ? "p0" : "p1"}" style="font-size:.75rem">${u.owner === HUMAN ? "You" : "AI"}</span></h3>
      <p class="sub">${esc(factionOf(p.faction).name)} · ⚙${p.cost} · <span title="Supply: what it counts for on objectives and when disengaging">◆${u.onBoard && currentSupply(u) !== p.supply ? `${currentSupply(u)}/${p.supply}` : p.supply}</span> · ${alive}/${p.models} models · ${fearless ? "fearless" : `nerve ${p.nerve ?? 7}`} · ${esc(p.blurb)}</p>
      <div class="stats">
        <div>${u.onBoard ? effectiveMove(s, u) : p.move}"<small>Move</small></div>
        <div>${p.hp}<small>HP/model</small></div>
        <div>${p.shield || "–"}<small>Shield</small></div>
        <div>${p.armor <= 6 ? `${p.armor}+` : "–"}<small>Save</small></div>
      </div>
      <div class="tags">${p.keywords.map((k) => `<span class="tag kw" title="${esc(KEYWORD_TEXT[k])}">${esc(k)}</span>`).join("")}</div>
      ${p.weapons.map((w) => `<div class="weapon">⚔ ${esc(weaponLine(w))}</div>`).join("")}
      ${p.impact ? `<div class="weapon">${esc(impactLine(p))}</div>` : ""}
      ${p.evade ? `<div class="weapon">${esc(evadeLine(p))}</div>` : ""}
      ${p.abilities.map((a) => `<div class="ability"><b>${esc(ABILITIES[a].name)}</b> <small>(${ABILITIES[a].kind}${ABILITIES[a].usesPerGame ? `, ${ABILITIES[a].usesPerGame - (u.abilityUses[a] ?? 0)} left` : ""})</small>: ${esc(ABILITIES[a].text)}</div>`).join("")}
      ${statuses.length ? `<div class="tags">${statuses.map((x) => `<span class="tag">${x}</span>`).join("")}</div>` : ""}
      ${canRally ? `<button class="mini" id="rally-btn" style="margin-top:6px">📣 Rally (${RALLY_CP} CP)</button>` : ""}`,
    );
    if (changed && canRally) {
      el.querySelector("#rally-btn")?.addEventListener("click", () =>
        this.issue({ type: "rally", player: HUMAN as 0, target: u.uid }),
      );
    }
  }

  private renderActions(sel: Unit | undefined): void {
    const el = this.els.sidebar.querySelector("#actions")!;
    const s = this.state;
    if (!this.humanTurn()) {
      setHTML(el, `<p class="hint">${s.over ? "The battle is over." : "Waiting for the AI…"}</p>`);
      return;
    }
    if (!sel) {
      const n = eligibleUnits(s, HUMAN).length;
      const hint =
        this.mode.kind === "deploy"
          ? "Move over (or tap) your shaded zone: a green ✓ shows where the unit fits, a red ✕ says why not. Click (or tap again) to place it."
          : n
            ? `${n} unit${n > 1 ? "s" : ""} can still act this phase. Click one to activate it.`
            : s.phase === "movement" && reserves(s, HUMAN).some((u) => !canAffordDeploy(s, u))
              ? "Deploy from your reserves, or pass."
              : "Nothing left to activate. Pass to move on.";
      // Picking a spot for a reserve or a support card: a way out without a keyboard.
      const cancel = this.mode.kind === "deploy" || this.mode.kind === "support" ? `<button data-act="cancel" class="secondary">Cancel<span class="key-hint"> [Esc]</span></button>` : "";
      if (setHTML(el, `<p class="hint" style="margin:0">${hint}</p>${cancel}`)) this.bindActions(el, undefined);
      return;
    }
    const p = profileOf(sel);
    const m = this.mode;
    const why = (a: UnitAction) => actionProblem(s, sel.uid, a);
    const btn = (act: string, label: string, on: boolean, extra: string, problem: string | null, title = "") =>
      `<button data-act="${act}" ${extra} class="${on ? "selected" : ""}" ${buttonAttrs(problem, title)}>${label}${whyLine(problem)}</button>`;
    const out: string[] = [];
    // Engaged in melee: say so up front, and what that leaves.
    const foes = engagedWith(s, sel);
    if (foes.length) {
      const names = foes.map((f) => esc(profileOf(f).name)).join(", ");
      const left =
        s.phase === "movement"
          ? `It can only disengage (${esc(disengageText(s, sel))}) or hunker.`
          : s.phase === "assault"
            ? "It can only shoot the unit it's fighting, or wait for combat."
            : "It fights this phase.";
      out.push(`<div class="engaged-note" role="status">⚔ <b>Engaged</b> with ${names}. ${left}</div>`);
    } else if (sel.status.disengaged && s.phase !== "combat") {
      out.push(
        `<div class="engaged-note exhausted" role="status">😮‍💨 <b>Exhausted</b> from disengaging: it sits out the assault phase${p.keywords.includes("light") ? " (light: it may still shoot)" : ""} and can't charge.</div>`,
      );
    }
    const abilityButtons = () =>
      p.abilities
        .filter((a) => ABILITIES[a].kind === "active" && ABILITIES[a].phase === s.phase)
        .map((a) => {
          const def = ABILITIES[a];
          const left = def.usesPerGame === undefined ? null : def.usesPerGame - (sel.abilityUses[a] ?? 0);
          return btn(
            "ability",
            `✨ ${def.name}${left !== null ? ` (${left} left)` : ""}${def.cp ? ` · ${def.cp} CP` : ""}`,
            m.kind === "ability" && m.id === a,
            `data-ab="${a}"`,
            why({ kind: "ability", id: a }),
            def.text,
          );
        });
    const mv = effectiveMove(s, sel);
    if (s.phase === "movement") {
      out.push(`<p class="hint" style="margin:0">Click a model to make it the leader (★), then click where it should go. The rest follow within 2".</p>`);
      out.push(btn("move", `🏃 Move (up to ${mv}")`, m.kind === "move", "", why({ kind: "move" })));
      const dis = why({ kind: "disengage" });
      out.push(btn("disengage", `🏃 Disengage (up to ${mv}")${dis ? "" : `<small class="odds">${esc(disengageText(s, sel))}</small>`}`, m.kind === "disengage", "", dis));
      out.push(...abilityButtons());
      out.push(btn("hunker", `🧱 Hunker down (+1 save vs shots)<span class="key-hint"> [H]</span>`, false, "", why({ kind: "hunker" })));
      out.push(btn("hold", "✋ Hold position", false, "", why({ kind: "hold" })));
    } else if (s.phase === "assault") {
      p.weapons.forEach((w, i) => {
        if (w.melee) return;
        out.push(btn("shoot", `🎯 ${esc(w.name)} (${w.range}")`, m.kind === "shoot" && m.weapon === i, `data-w="${i}"`, why({ kind: "shoot", weapon: i })));
      });
      if (p.weapons.some((w) => w.melee)) out.push(btn("charge", `💥 Charge (up to ${mv}")`, m.kind === "charge", "", why({ kind: "charge" })));
      out.push(btn("advance", `🏃 Advance (up to ${mv}")`, m.kind === "advance", "", why({ kind: "advance" })));
      out.push(...abilityButtons());
      out.push(btn("hunker", `🧱 Hunker down<span class="key-hint"> [H]</span>`, false, "", why({ kind: "hunker" })));
      out.push(btn("hold", "✋ Hold", false, "", why({ kind: "hold" })));
    } else if (s.phase === "combat") {
      p.weapons.forEach((w, i) => {
        if (w.melee) out.push(btn("fight", `⚔ ${esc(w.name)}`, m.kind === "fight" && m.weapon === i, `data-w="${i}"`, why({ kind: "fight", weapon: i })));
      });
      out.push(`<p class="hint" style="margin:0">Click an engaged enemy to fight it.</p>`);
      out.push(btn("hold", "✋ Don't fight", false, "", why({ kind: "hold" })));
    }
    out.push(`<button data-act="cancel" class="secondary">Cancel<span class="key-hint"> [Esc]</span></button>`);
    if (setHTML(el, out.join("") + `<!--${sel.uid}-->`)) this.bindActions(el, sel);
  }

  private bindActions(el: Element, sel: Unit | undefined): void {
    el.querySelectorAll<HTMLButtonElement>("button[data-act]").forEach((b) =>
      b.addEventListener("click", () => {
        const a = b.dataset.act!;
        if (a === "pass") return void this.issue({ type: "pass", player: HUMAN });
        if (a === "cancel") {
          this.clearSelection();
          return this.refresh();
        }
        if (!sel) return;
        if (a === "hunker") return void this.issue({ type: "hunker", uid: sel.uid });
        if (a === "hold") return void this.issue({ type: "hold", uid: sel.uid });
        if (a === "move" || a === "advance" || a === "disengage" || a === "charge")
          this.mode = { kind: a };
        else if (a === "shoot" || a === "fight")
          this.mode = { kind: a, weapon: Number(b.dataset.w) };
        else if (a === "ability") {
          const id = b.dataset.ab as AbilityId;
          if (!ABILITIES[id].needs) return void this.issue({ type: "ability", uid: sel.uid, ability: id });
          this.mode = { kind: "ability", id };
          this.abilityTarget = null;
        }
        this.refresh();
      }),
    );
  }

  /** One-line call-out for a hovered unit: statuses, abilities ready now, what it can still do. */
  private unitBrief(u: Unit): string {
    const s = this.state;
    const p = profileOf(u);
    const bits: string[] = [`${p.name} (${u.owner === HUMAN ? "yours" : "AI"})`];
    if (u.onBoard && eligibleUnits(s, u.owner).includes(u)) bits.push("✅ can act");
    else if (u.onBoard) bits.push("💤 done this phase");
    if (u.status.shaken) bits.push("😱 Shaken");
    if (u.onBoard && isEngaged(s, u)) bits.push("⚔ engaged");
    if (u.status.hunkered) bits.push("🧱 hunkered");
    if (u.onBoard && u.status.disengaged && s.phase !== "combat") bits.push("😮‍💨 exhausted: sits out the assault phase");
    if (u.status.slowedRounds > 0) bits.push("🐌 slowed");
    bits.push(...abilityStatusTags(u));
    for (const a of p.abilities) {
      const def = ABILITIES[a];
      if (def.kind !== "active") continue;
      const left = def.usesPerGame === undefined ? null : def.usesPerGame - (u.abilityUses[a] ?? 0);
      if (left === 0) continue;
      bits.push(`✨ ${def.name}${def.cp ? ` (${def.cp} CP)` : ""}${def.phase === s.phase ? " ready" : ` in ${PHASE_NAMES[def.phase!]}`}`);
    }
    if (p.impact) bits.push("💥 impact on charge");
    return bits.join(" · ");
  }

  /** Docked command bar for the selected unit: abilities, rally, hunker, hold. */
  private renderCallout(sel: Unit | undefined): void {
    const s = this.state;
    let el = this.els.stage.querySelector<HTMLDivElement>(".unit-callout");
    // Placing a reserve or a support card: the bar just names it, with a way out (no Esc on a touch screen).
    const picking = !sel && this.humanTurn() ? this.pickingLabel() : null;
    if (!picking && (!sel || !this.humanTurn() || !sel.onBoard)) {
      el?.remove();
      return;
    }
    if (!el) {
      el = document.createElement("div");
      el.className = "unit-callout";
      this.els.stage.appendChild(el);
    }
    const cancelBtn = `<button data-co="cancel" class="secondary co-cancel" title="Cancel (Esc)" aria-label="Cancel">✕</button>`;
    if (picking || !sel) {
      const html = `<div class="co-head"><b>${esc(picking ?? "")}</b></div><div class="co-chips">${cancelBtn}</div>`;
      const holder = el as HTMLDivElement & { __html?: string };
      if (holder.__html !== html) {
        holder.__html = html;
        el.innerHTML = html;
        el.querySelector("button[data-co]")?.addEventListener("click", () => {
          this.clearSelection();
          this.refresh();
        });
      }
      // Up top, out of the way of your deployment zone (usually along the bottom).
      el.classList.add("dock-top");
      requestAnimationFrame(() => el?.classList.add("in"));
      return;
    }
    const p = profileOf(sel);
    const chips: string[] = [];
    const engaged = isEngaged(s, sel);
    if (engaged) chips.push(`<span class="co-tag" title="Engaged in melee: ${esc(engagedWith(s, sel).map((f) => profileOf(f).name).join(", "))}">⚔ Engaged</span>`);
    else if (sel.status.disengaged && s.phase !== "combat") chips.push(`<span class="co-tag exhausted" title="Exhausted from disengaging">😮‍💨 Exhausted</span>`);
    for (const a of p.abilities) {
      const def = ABILITIES[a];
      if (def.kind !== "active" || def.phase !== s.phase) continue;
      const cost = def.cp ?? 0;
      const why = actionProblem(s, sel.uid, { kind: "ability", id: a });
      chips.push(
        `<button data-co="ability" data-ab="${a}" ${buttonAttrs(why, def.text)}>✨ ${esc(def.name)}${cost ? ` <small>${cost} CP</small>` : ""}${why ? ` <small class="why">⛔ ${esc(why)}</small>` : ""}</button>`,
      );
    }
    if (sel.status.shaken) {
      const why = commandProblem(s, { type: "rally", player: HUMAN as 0, target: sel.uid });
      chips.push(`<button data-co="rally" ${buttonAttrs(why)}>📣 Rally <small>${RALLY_CP} CP</small></button>`);
    }
    if (s.phase !== "combat") chips.push(`<button data-co="hunker" class="secondary" ${buttonAttrs(actionProblem(s, sel.uid, { kind: "hunker" }))}>🧱 Hunker</button>`);
    chips.push(`<button data-co="hold" class="secondary" ${buttonAttrs(actionProblem(s, sel.uid, { kind: "hold" }))}>✋ ${s.phase === "combat" ? "Don't fight" : "Hold"}</button>`);
    chips.push(cancelBtn);
    const hint =
      s.phase === "movement"
        ? engaged
          ? "Point at open ground to disengage"
          : "Point at ground to move"
        : s.phase === "assault"
          ? "Point at an enemy to shoot or charge, or at ground to advance"
          : "Point at an engaged enemy to fight";
    const html = `<div class="co-head"><b>${esc(p.name)}</b> <small>${esc(hint)}</small></div><div class="co-chips">${chips.join("")}</div>`;
    const holder = el as HTMLDivElement & { __html?: string };
    if (holder.__html !== html) {
      holder.__html = html;
      el.innerHTML = html;
      el.querySelectorAll<HTMLButtonElement>("button[data-co]").forEach((b) =>
        b.addEventListener("click", () => {
          const what = b.dataset.co;
          if (what === "cancel") {
            this.clearSelection();
            return this.refresh();
          }
          if (what === "rally") return void this.issue({ type: "rally", player: HUMAN as 0, target: sel.uid });
          if (what === "hunker") return void this.issue({ type: "hunker", uid: sel.uid });
          if (what === "hold") return void this.issue({ type: "hold", uid: sel.uid });
          if (what === "ability") {
            const id = b.dataset.ab as AbilityId;
            if (!ABILITIES[id].needs) return void this.issue({ type: "ability", uid: sel.uid, ability: id });
            this.mode = { kind: "ability", id };
            this.abilityTarget = null;
            this.refresh();
          }
        }),
      );
    }
    // Docked at the bottom-centre of the board (see hud.css); if the unit itself is low on screen,
    // dock at the top instead so the bar never sits on top of the unit you're ordering.
    const lead = sel.models.find((m) => m.id === this.leader && m.alive) ?? aliveModels(sel)[0];
    if (lead) {
      const sp = this.renderer.toScreen(drawPos(sel, lead));
      el.classList.toggle("dock-top", sp.y > this.els.stage.clientHeight * 0.55);
    }
    requestAnimationFrame(() => el?.classList.add("in"));
  }

  /** What you're placing when no unit is selected: a reserve unit or a support card (null otherwise). */
  private pickingLabel(): string | null {
    const m = this.mode;
    if (m.kind === "deploy" && this.deployUid) {
      const u = unitById(this.state, this.deployUid);
      return u ? `Deploy ${profileOf(u).name}` : null;
    }
    if (m.kind === "support") return abilityOf(m.support, m.ability)?.name ?? null;
    return null;
  }

  /** "Go first or second?" prompt when the order is the human's choice. */
  private renderOrderChoice(): void {
    const s = this.state;
    let el = this.els.stage.querySelector<HTMLDivElement>(".order-choice");
    const mine = this.started && !s.over && s.orderChoice?.player === HUMAN && !this.aiRunning && !this.busy;
    if (!mine) {
      el?.remove();
      return;
    }
    if (el) return;
    el = document.createElement("div");
    el.className = "order-choice";
    const why =
      s.orderChoice!.reason === "rolloff"
        ? "You won the initiative roll-off!"
        : s.orderChoice!.reason === "tie"
          ? "Tied on VP, and you won the roll-off!"
          : "You're behind on VP, so you call it.";
    const title = document.createElement("h3");
    title.textContent = `Round ${s.round}: who goes first?`;
    const sub = document.createElement("p");
    sub.textContent = `${why} Going first gets you into position first; going second lets you react to the enemy.`;
    const row = document.createElement("div");
    row.className = "row";
    for (const [label, goFirst] of [
      ["▶ We go first", true],
      ["⏸ They go first", false],
    ] as const) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      if (!goFirst) b.className = "secondary";
      b.addEventListener("click", () => {
        el?.remove();
        this.issue({ type: "chooseOrder", player: HUMAN as 0, goFirst });
      });
      row.appendChild(b);
    }
    el.append(title, sub, row);
    this.els.stage.appendChild(el);
    (row.firstElementChild as HTMLButtonElement | null)?.focus({ preventScroll: true });
  }

  /**
   * Pop-up menu of units to deploy (or drop in) at a spot. Each choice is checked with the reducer
   * at that exact spot: the ones that would work are enabled, the rest are greyed out with the reason.
   */
  private openDeployMenu(p: Vec, units: Unit[], drop?: { title: string; cmd: (u: Unit) => Command }): void {
    const s = this.state;
    const menu = document.createElement("div");
    menu.className = units.length > 5 ? "deploy-menu wide" : "deploy-menu";
    const title = document.createElement("h4");
    title.textContent = drop?.title ?? deployMenuTitle(s);
    menu.appendChild(title);
    const rows = units.map((u) => {
      const cmd: Command = drop ? drop.cmd(u) : { type: "deploy", uid: u.uid, to: p };
      return { u, cmd, why: commandProblem(s, cmd) };
    });
    for (const { u, cmd, why } of rows) {
      const prof = profileOf(u);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "secondary";
      b.disabled = !!why;
      if (why) b.setAttribute("aria-disabled", "true");
      b.title = why ? `Can't: ${why}` : prof.blurb;
      const name = document.createElement("span");
      name.textContent = `${why ? "" : "✓ "}${prof.name}`;
      const cost = document.createElement("small");
      cost.textContent = deployMenuDetail(s, u, null);
      b.append(name, cost);
      if (why) {
        const line = document.createElement("small");
        line.className = "why";
        line.textContent = `⛔ ${why}`;
        b.append(line);
      }
      b.addEventListener("click", () => {
        this.closeDeployMenu();
        this.issue(cmd);
      });
      menu.appendChild(b);
    }
    if (!rows.some((r) => !r.why)) {
      const none = document.createElement("p");
      none.className = "hint";
      none.textContent = "Nothing can go here right now.";
      menu.appendChild(none);
    }
    const sp = this.renderer.toScreen(p);
    const stage = this.els.stage;
    stage.appendChild(menu);
    // Place it next to the click, kept fully inside the board area.
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    menu.style.left = `${Math.max(6, Math.min(stage.clientWidth - w - 6, sp.x + 10))}px`;
    menu.style.top = `${Math.max(6, Math.min(stage.clientHeight - h - 6, sp.y - h / 2))}px`;
    this.deployMenu = menu;
    this.refresh();
    (menu.querySelector("button:not([disabled])") as HTMLButtonElement | null)?.focus({ preventScroll: true });
  }

  private closeDeployMenu(): void {
    this.deployMenu?.remove();
    this.deployMenu = null;
  }

  /** Comic-strip narration for a batch of events (plus whose turn it is now). */
  private narrate(before: GameState, events: GameEvent[]): void {
    const s = this.state;
    const ownerOf = (uid: string) => unitById(s, uid)?.owner ?? unitById(before, uid)?.owner;
    const toneFor = (owner: number | undefined, goodForMe = true): AlertTone =>
      owner === undefined ? "neutral" : (owner === HUMAN) === goodForMe ? "you" : "ai";
    for (const e of events) {
      if (e.type === "attack") {
        const r = e.report;
        const a = unitName(s, r.uid);
        const t = unitName(s, r.target);
        if (r.unitDestroyed) {
          this.alerts.push("WIPED OUT!", { sub: `${a} finishes off ${t}`, tone: ownerOf(r.target) === HUMAN ? "bad" : "good" });
        } else if (r.kind === "impact" && r.damage > 0) {
          this.alerts.push("SLAM!", { sub: `${a} crashes into ${t}: ${r.damage} dmg`, tone: toneFor(ownerOf(r.uid)) });
        } else if (r.damage >= 3) {
          const word = r.kind === "barrage" ? "KA-BOOM!" : r.kind === "fight" ? "CHOMP!" : r.kind === "overwatch" ? "AMBUSH!" : "BLAM!";
          this.alerts.push(word, { sub: `${a} → ${t}: ${r.damage} dmg`, tone: toneFor(ownerOf(r.uid)) });
        } else if (r.kind === "overwatch") {
          this.alerts.push("OVERWATCH!", { sub: `${a} opens fire on ${t}`, tone: toneFor(ownerOf(r.uid)) });
        }
      } else if (e.type === "moved" && e.kind === "charge") {
        this.alerts.push("CHARGE!", { sub: `${unitName(s, e.uid)} charges in`, tone: toneFor(ownerOf(e.uid)) });
      } else if (e.type === "moved" && e.kind === "teleport") {
        this.alerts.push("ZAP!", { sub: `${unitName(s, e.uid)} teleports`, tone: toneFor(ownerOf(e.uid)) });
      } else if (e.type === "deployed" && ownerOf(e.uid) === AI) {
        this.alerts.push("REINFORCEMENTS!", { sub: `The AI deploys ${unitName(s, e.uid)}`, tone: "ai" });
      } else if (e.type === "morale" && e.shaken) {
        this.alerts.push("SHAKEN!", { sub: `${unitName(s, e.uid)} loses its nerve`, tone: ownerOf(e.uid) === HUMAN ? "bad" : "good" });
      } else if (e.type === "rallied" && e.how === "cp") {
        this.alerts.push("RALLY!", { sub: `${unitName(s, e.uid)} steadies up`, tone: toneFor(ownerOf(e.uid)) });
      } else if (e.type === "support" && e.player === AI) {
        this.alerts.push("AI SUPPORT!", { sub: e.text, tone: "ai" });
      } else if (e.type === "summoned") {
        this.alerts.push("INCOMING!", { sub: `${unitName(s, e.uid)} appears`, tone: toneFor(ownerOf(e.uid)) });
      } else if (e.type === "scored") {
        this.alerts.push(`+${e.vp} VP`, { sub: `${e.player === HUMAN ? "You" : "AI"}: ${e.reason}`, tone: e.player === HUMAN ? "you" : "ai" });
      } else if (e.type === "flag") {
        this.alerts.push("SNACK ALERT!", { sub: e.text, tone: "good" });
      } else if (e.type === "phase") {
        // The phase banner (see handleEvents) holds the AI until it has landed.
      } else if (e.type === "rolloff") {
        this.log(`🎲 Tied on VP: roll-off. You ${e.rolls[e.rolls.length - 1]![0]}, AI ${e.rolls[e.rolls.length - 1]![1]}. ${e.winner === HUMAN ? "You choose" : "The AI chooses"} who goes first.`);
        this.alerts.push("TIE! ROLL-OFF", { sub: `${e.winner === HUMAN ? "You" : "The AI"} won: choose who goes first`, tone: e.winner === HUMAN ? "you" : "ai" });
      } else if (e.type === "orderChosen") {
        const first = e.goFirst ? e.player : e.player === 0 ? 1 : 0;
        const who = e.player === HUMAN ? "You" : "The AI";
        this.log(`${who} chose to go ${e.goFirst ? "first" : "second"} in round ${e.round}.`);
        this.alerts.push(first === HUMAN ? "YOU GO FIRST!" : "AI GOES FIRST", {
          sub: `${who} chose to go ${e.goFirst ? "first" : "second"}`,
          tone: first === HUMAN ? "you" : "ai",
        });
      } else if (e.type === "initiativeClaimed") {
        const who = e.player === HUMAN ? "You" : "The AI";
        const next = e.nextPhase === "assault" ? "the Assault phase" : "next round";
        this.log(`⚡ ${who} passed early and claimed the initiative for ${next}.`);
        this.alerts.push("INITIATIVE CLAIMED!", { sub: `${who} will lead ${next}`, tone: e.player === HUMAN ? "you" : "ai" });
      } else if (e.type === "gameOver") {
        const word = e.winner === "draw" ? "STALEMATE!" : e.winner === HUMAN ? "VICTORY!" : "DEFEAT!";
        this.alerts.push(word, { sub: e.reason, big: true, tone: e.winner === HUMAN ? "you" : e.winner === "draw" ? "neutral" : "ai", ms: 3500 });
      }
    }
  }

  /** Faction accent styling (data-faction / --faction-color) on the army, supports and unit card panels. */
  private applyFactionAccents(focus: Unit | undefined): void {
    const set = (sel: string, factionId: string) => {
      const el = this.els.sidebar.querySelector<HTMLElement>(sel);
      if (!el || el.dataset.faction === factionId) return;
      el.dataset.faction = factionId;
      el.style.setProperty("--faction-color", `#${factionOf(factionId).color.toString(16).padStart(6, "0")}`);
    };
    const mine = this.state.factions[HUMAN];
    set("#army", mine);
    set("#supports", mine);
    set("#card", focus ? profileOf(focus).faction : mine);
  }

  private updateLogBadge(): void {
    const badge = this.logDrawer.querySelector(".badge");
    if (badge) badge.textContent = this.unread ? String(this.unread) : "";
  }

  private log(html: string, owner?: number): void {
    const el = this.logDrawer.querySelector("#log")!;
    if (this.logDrawer.classList.contains("collapsed")) {
      this.unread++;
      this.updateLogBadge();
    }
    const p = document.createElement("p");
    if (owner !== undefined) p.className = `p${owner}`;
    p.innerHTML = html;
    el.appendChild(p);
    el.scrollTop = el.scrollHeight;
  }

  private flash(text: string): void {
    this.log(`<span style="color:var(--bad)">${esc(text)}</span>`);
  }

  private showGameOver(): void {
    const s = this.state;
    const title =
      s.winner === "draw" ? "It's a draw!" : s.winner === HUMAN ? "Victory!" : "Defeat!";
    const overlay = document.getElementById("overlay")!;
    if (this.hooks.campaign) {
      overlay.innerHTML = `
      <div class="modal" style="max-width:440px;text-align:center" role="dialog" aria-modal="true" aria-labelledby="go-title">
        <h1 id="go-title">${title}</h1>
        <p class="tagline">${esc(this.hooks.campaign.title)} · Final score: you ${s.players[0].vp}, AI ${s.players[1].vp}</p>
        <div class="row" style="justify-content:center">
          <button id="go-campaign">⚔ Back to the campaign</button>
          <button class="secondary" id="go-close">Look at the board</button>
        </div>
      </div>`;
      overlay.classList.add("show");
      const back = overlay.querySelector<HTMLButtonElement>("#go-campaign")!;
      back.addEventListener("click", () => this.reportResult(false));
      overlay.querySelector("#go-close")!.addEventListener("click", () => {
        overlay.classList.remove("show");
        this.renderTopbar();
      });
      back.focus();
      return;
    }
    overlay.innerHTML = `
      <div class="modal" style="max-width:420px;text-align:center">
        <h1>${title}</h1>
        <p class="tagline">Final score: you ${s.players[0].vp}, AI ${s.players[1].vp}</p>
        <div class="row" style="justify-content:center">
          <button id="go-again">Play again</button>
          <button class="secondary" id="go-close">Look at the board</button>
        </div>
      </div>`;
    overlay.classList.add("show");
    overlay.querySelector("#go-again")!.addEventListener("click", () => this.onNewGame());
    overlay
      .querySelector("#go-close")!
      .addEventListener("click", () => overlay.classList.remove("show"));
  }
}

export function showRules(): void {
  const overlay = document.getElementById("overlay")!;
  overlay.innerHTML = `
    <div class="modal" style="max-width:700px">
      <h1>How to play</h1>
      <p class="tagline">Each round has four phases. Players take turns activating one unit at a time; whoever has the initiative goes first.</p>
      <ol>
        <li><b>Movement:</b> deploy a unit from reserves into your zone (costs ⚙ resources and ◆ supply), move, disengage from melee, hunker down, or use a movement ability.</li>
        <li><b>Assault:</b> shoot, charge into base contact, advance, hunker, or use an assault ability. Engaged units can only shoot the unit they're fighting.</li>
        <li><b>Combat:</b> engaged units fight. Units that charged fight first and get +1 die per model.</li>
        <li><b>Scoring:</b> the mission awards VP. Shields recharge, regenerating critters heal, you gain resources and your supply cap grows.</li>
      </ol>
      <ul>
        <li><b>Squads:</b> pick a leader model (★) and move it; the rest follow within 2". Range, sight and cover are checked model by model.</li>
        <li><b>Elevation:</b> raised decks are reached by ramps or ladders. Heavy units can't climb ladders, and Jump units hop anywhere. Ground models can't see past a deck, but anyone on top can. Shooting down ignores cover; shooting up at a ledge gives the target cover.</li>
        <li><b>Flyers</b> ignore terrain and can't hold objectives. Only anti-air weapons and other flyers can hurt them.</li>
        <li><b>Keywords</b> matter: armoured shrugs off 1 AP unless the weapon is built to crack armour; some weapons get bonus dice or damage against light, armoured or flying targets.</li>
        <li><b>Supply:</b> destroyed units free their supply, so you can bring in more from reserves.</li>
      </ul>
      <ul>
        <li><b>Morale:</b> battered units test their nerve and can become Shaken (they hit worse, won't charge, can't hold objectives). Rally them for 1 CP.</li>
        <li><b>Terrain:</b> scrub and craters are difficult terrain (double cost to cross). Models in the line of fire give the target cover.</li>
        <li><b>Weapon traits:</b> blast, torrent, heavy, rending and pistol. Some units also deal impact damage when their charge lands.</li>
        <li><b>Attacks:</b> roll to hit; <b>precision</b> turns some misses into hits. Then the target may roll <b>evade</b> (only in the situations its card lists: point-blank, shooting, melee or blasts); <b>tracking</b> cancels evades. Whatever gets through rolls armour saves.</li>
        <li><b>Melee and shooting:</b> you can't shoot into a melee without precision, and engaged units can only shoot what they're fighting. Point-blank pistol shots can't be evaded.</li>
        <li><b>Supports:</b> spend CP on your support cards as free actions; reactions arm now and fire later.</li>
        <li><b>Unit abilities</b> are free actions during that unit's activation (one per phase): Blink then move, Recall then shoot. Some cost CP from the same pool as supports.</li>
      </ul>
      <p class="hint">Keys: Esc cancels, H hunkers, P passes the rest of the phase, M measures, Ctrl+Z undoes. Hover enemies with a unit selected to see the odds.</p>
      <p class="hint">The pointer tells you what a click will do: a green ✓, crosshair or + means it works, a red no-entry sign means it won't, and the tip next to it says why. Greyed-out buttons say why they're off. Before any attack's dice, the board marks the attacker, the target and the weapon.</p>
      <p class="hint">On a touch screen: tap a unit to select or inspect it. A tap that gives an order (move, shoot, charge, deploy...) first shows the preview and its tip; tap the same spot again to confirm. Drag to pan, pinch to zoom, and use ✕ on the unit bar to cancel.</p>
      <button id="rules-close">Got it</button>
    </div>`;
  overlay.classList.add("show");
  overlay
    .querySelector("#rules-close")!
    .addEventListener("click", () => overlay.classList.remove("show"));
}
