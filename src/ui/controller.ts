// Glue between the pure engine, the Pixi board and the DOM HUD. The human is player 0; the AI is player 1.

import { aiCommand } from "../engine/ai";
import { expectedDamage, planMelee, planShooting, type AttackPlan } from "../engine/combat";
import { ABILITIES } from "../engine/data/abilities";
import { FACTIONS } from "../engine/data/factions";
import { MAPS } from "../engine/data/maps";
import { MISSIONS } from "../engine/data/missions";
import { planUnitMove } from "../engine/formation";
import { applyCommand, createGame, planCharge, wouldEngage, type GameSetup } from "../engine/game";
import { dist } from "../engine/geometry";
import { profileOf } from "../engine/profile";
import {
  aliveModels,
  canAffordDeploy,
  effectiveMove,
  eligibleUnits,
  engagedWith,
  isEngaged,
  onBoard,
  reserves,
  supplyUsed,
  unitById,
  unitGap,
} from "../engine/rules";
import { planRoute } from "../engine/terrain";
import type { AbilityId, Command, GameEvent, GameState, Model, Unit, Vec } from "../engine/types";
import { describeEvent, esc, KEYWORD_TEXT, PHASE_NAMES, weaponLine } from "./describe";
import { BoardRenderer, drawPos, type RenderView } from "./renderer";

const HUMAN = 0;
const AI = 1;
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
  | { kind: "none" }
  | { kind: "move" | "advance" | "disengage" | "charge" | "deploy" }
  | { kind: "shoot" | "fight"; weapon: number | null }
  | { kind: "ability"; id: AbilityId };

export class Controller {
  private state: GameState;
  private selected: string | null = null;
  private leader: number | null = null;
  private deployUid: string | null = null;
  private abilityTarget: string | null = null;
  private mode: Mode = { kind: "none" };
  private hover: Vec | null = null;
  private aiRunning = false;
  private generation = 0;
  private tooltip: HTMLDivElement;

  constructor(
    private renderer: BoardRenderer,
    private els: { topbar: HTMLElement; sidebar: HTMLElement; stage: HTMLElement },
    private onNewGame: () => void,
    setup: GameSetup,
  ) {
    this.state = createGame(setup);
    this.tooltip = document.createElement("div");
    this.tooltip.className = "tooltip";
    this.tooltip.style.display = "none";
    els.stage.appendChild(this.tooltip);
    els.sidebar.innerHTML = `
      <section class="panel" id="army"></section>
      <section class="panel" id="card"></section>
      <section class="panel actions" id="actions"></section>
      <section class="panel" id="log"></section>`;
    renderer.onPointerMove = (p) => {
      this.hover = p;
      this.refresh();
    };
    renderer.onPointerLeave = () => {
      this.hover = null;
      this.refresh();
    };
    renderer.onPointerDown = (p) => this.click(p);
    window.onkeydown = (e) => this.key(e);
    const mission = MISSIONS[this.state.missionId]!;
    this.log(
      `<b>${esc(mission.name)} at ${esc(MAPS[this.state.mapId]!.name)}.</b> ${esc(mission.blurb)} You (${esc(FACTIONS[setup.factions[0]].name)}, cyan) vs the AI (${esc(FACTIONS[setup.factions[1]].name)}, red). ${this.state.initiative === HUMAN ? "You have" : "The AI has"} the initiative.`,
    );
    this.log(`Your army starts in reserve. Deploy units into your shaded zone from the <b>Army</b> panel.`);
    this.refresh();
    void this.runAi();
  }

  destroy(): void {
    this.generation++;
    this.tooltip.remove();
    window.onkeydown = null;
  }

  // ---------- helpers ----------

  private humanTurn(): boolean {
    return !this.state.over && !this.aiRunning && this.state.activePlayer === HUMAN;
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
        return { kind: isEngaged(this.state, u) ? "disengage" : "move" };
      case "assault":
        if (p.weapons.some((w) => !w.melee)) return { kind: "shoot", weapon: null };
        if (p.weapons.some((w) => w.melee)) return { kind: "charge" };
        return { kind: "advance" };
      case "combat":
        return { kind: "fight", weapon: null };
      default:
        return { kind: "none" };
    }
  }

  private select(u: Unit, leader?: number): void {
    this.selected = u.uid;
    this.leader = leader ?? aliveModels(u)[0]?.id ?? null;
    this.deployUid = null;
    this.abilityTarget = null;
    this.mode = this.defaultMode(u);
    this.refresh();
  }

  private clearSelection(): void {
    this.selected = null;
    this.leader = null;
    this.deployUid = null;
    this.abilityTarget = null;
    this.mode = { kind: "none" };
  }

  private bestWeapon(a: Unit, t: Unit, melee: boolean): { index: number; plan: AttackPlan } | string {
    const weapons = profileOf(a).weapons;
    const chosen = this.mode.kind === "shoot" || this.mode.kind === "fight" ? this.mode.weapon : null;
    let best: { index: number; plan: AttackPlan; exp: number } | null = null;
    let err = melee ? "No melee weapon" : "No ranged weapon";
    weapons.forEach((w, i) => {
      if (w.melee !== melee || (chosen !== null && chosen !== i)) return;
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

  private click(p: Vec): void {
    if (!this.humanTurn()) return;
    const s = this.state;
    const hit = this.modelAt(p);
    const sel = this.sel();

    if (this.mode.kind === "deploy" && this.deployUid) {
      if (!hit) this.issue({ type: "deploy", uid: this.deployUid, to: p });
      return;
    }
    if (this.mode.kind === "ability" && sel) {
      const def = ABILITIES[this.mode.id];
      if (def.needs === "friendlyUnit") {
        if (hit && hit.unit.owner === HUMAN) this.issue({ type: "ability", uid: sel.uid, ability: this.mode.id, target: hit.unit.uid });
        return;
      }
      if (def.needs === "friendlyUnitAndPoint" && !this.abilityTarget) {
        if (hit && hit.unit.owner === HUMAN && hit.unit.uid !== sel.uid) {
          this.abilityTarget = hit.unit.uid;
          this.refresh();
        }
        return;
      }
      if (!hit || def.needs === "point") {
        this.issue({ type: "ability", uid: sel.uid, ability: this.mode.id, point: p, target: this.abilityTarget ?? undefined });
        return;
      }
    }
    if (hit && hit.unit.owner === HUMAN) {
      if (sel && hit.unit.uid === sel.uid) {
        this.leader = hit.model.id;
        this.refresh();
      } else if (eligibleUnits(s, HUMAN).includes(hit.unit)) {
        this.select(hit.unit, hit.model.id);
      }
      return;
    }
    if (hit && sel) {
      if (this.mode.kind === "shoot") {
        const b = this.bestWeapon(sel, hit.unit, false);
        if (typeof b === "string") this.flash(b);
        else this.issue({ type: "shoot", uid: sel.uid, target: hit.unit.uid, weapon: b.index });
      } else if (this.mode.kind === "charge") {
        this.issue({ type: "charge", uid: sel.uid, target: hit.unit.uid });
      } else if (this.mode.kind === "fight") {
        const b = this.bestWeapon(sel, hit.unit, true);
        if (typeof b === "string") this.flash(b);
        else this.issue({ type: "fight", uid: sel.uid, target: hit.unit.uid, weapon: b.index });
      }
      return;
    }
    if (!hit && sel && this.leader !== null && (this.mode.kind === "move" || this.mode.kind === "advance" || this.mode.kind === "disengage")) {
      this.issue({ type: this.mode.kind, uid: sel.uid, leader: this.leader, to: p });
    }
  }

  private key(e: KeyboardEvent): void {
    if (!this.humanTurn()) return;
    const sel = this.sel();
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
    const r = applyCommand(this.state, cmd);
    if (!r.ok) {
      this.flash(r.error);
      return false;
    }
    const before = this.state;
    this.state = r.state;
    this.handleEvents(before, r.events);
    this.clearSelection();
    this.refresh();
    void this.runAi();
    return true;
  }

  private handleEvents(before: GameState, events: GameEvent[]): void {
    const centre = (uid: string): Vec | null => {
      const u = unitById(this.state, uid) ?? unitById(before, uid);
      const ms = u ? u.models.filter((m) => m.alive) : [];
      const list = ms.length ? ms : (unitById(before, uid)?.models.filter((m) => m.alive) ?? []);
      if (!list.length) return null;
      return { x: list.reduce((s, m) => s + m.pos.x, 0) / list.length, y: list.reduce((s, m) => s + m.pos.y, 0) / list.length };
    };
    for (const e of events) {
      const text = describeEvent(this.state, e);
      const owner =
        e.type === "attack" ? unitById(before, e.report.uid)?.owner : "uid" in e ? unitById(before, e.uid)?.owner : "player" in e ? e.player : undefined;
      if (text) this.log(text, owner);
      if (e.type === "attack") {
        const at = centre(e.report.target);
        if (at) this.renderer.floatText(at, e.report.unitDestroyed ? "KO!" : e.report.damage ? `-${e.report.damage}` : "Whiff!", e.report.damage ? 0xff6b6b : 0xffffff);
      } else if (e.type === "phase") {
        this.renderer.floatText({ x: this.state.board.width / 2, y: this.state.board.height / 2 }, `${PHASE_NAMES[e.phase]}!`, 0xffc83d);
      } else if (e.type === "scored") {
        this.renderer.floatText({ x: this.state.board.width / 2, y: this.state.board.height / 2 + 2 }, `${e.player === HUMAN ? "You" : "AI"} +${e.vp} VP`, e.player === HUMAN ? 0x2fb5c8 : 0xf0565b);
      } else if (e.type === "gameOver") {
        setTimeout(() => this.showGameOver(), 900);
      }
    }
  }

  private async runAi(): Promise<void> {
    if (this.aiRunning || this.state.over || this.state.activePlayer !== AI) return;
    const gen = this.generation;
    this.aiRunning = true;
    this.refresh();
    try {
      while (!this.state.over && this.state.activePlayer === AI) {
        await sleep(420);
        if (gen !== this.generation) return;
        const cmd = aiCommand(this.state);
        if ("uid" in cmd) this.selected = cmd.uid;
        this.refresh();
        await sleep(200);
        if (gen !== this.generation) return;
        let r = applyCommand(this.state, cmd);
        if (!r.ok) {
          console.error("AI command rejected", cmd, r.error);
          r = applyCommand(this.state, { type: "pass", player: AI });
          if (!r.ok) break;
        }
        const before = this.state;
        this.state = r.state;
        this.handleEvents(before, r.events);
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
    };
    let tip: string | null = null;

    if (this.humanTurn()) {
      if (this.mode.kind === "deploy" && this.deployUid) {
        const u = unitById(s, this.deployUid)!;
        view.zone = s.spawn[HUMAN];
        if (this.hover && !hit) {
          const plan = planUnitMove(s, u, u.models[0]!.id, this.hover, { allowance: 0, teleport: true, zone: s.spawn[HUMAN] });
          const r = profileOf(u).baseRadius;
          if (typeof plan === "string") {
            view.ghosts = [{ pos: this.hover, radius: r }];
            view.ghostOk = false;
            tip = plan;
          } else {
            view.ghosts = plan.placements.map((p) => ({ pos: p.pos, radius: r }));
            tip = `Deploy ${profileOf(u).name}`;
          }
        }
      } else if (sel) {
        tip = this.previewForSelected(sel, hit, view);
      }
    }
    this.renderer.render(view);
    this.renderTooltip(tip);
    this.renderTopbar();
    this.renderArmy();
    this.renderCard(hit?.unit ?? sel ?? (this.deployUid ? unitById(s, this.deployUid) : undefined));
    this.renderActions(sel);
  }

  private previewForSelected(sel: Unit, hit: { unit: Unit; model: Model } | undefined, view: RenderView): string | null {
    const s = this.state;
    const r = profileOf(sel).baseRadius;
    const leader = sel.models.find((m) => m.id === this.leader && m.alive) ?? aliveModels(sel)[0];
    const mode = this.mode;
    if (!leader) return null;

    if (mode.kind === "move" || mode.kind === "advance" || mode.kind === "disengage") {
      const mv = effectiveMove(s, sel);
      view.moveRing = { center: leader.pos, radius: mv };
      if (!this.hover || hit) return hit && hit.unit.uid === sel.uid ? "Click to make this model the leader" : null;
      const plan = planUnitMove(s, sel, leader.id, this.hover, { allowance: mv });
      if (typeof plan === "string") {
        view.ghosts = [{ pos: this.hover, radius: r }];
        view.ghostOk = false;
        return plan;
      }
      view.ghosts = plan.placements.map((p) => ({ pos: p.pos, radius: r }));
      const route = planRoute(s, sel, leader.pos, leader.elevation, this.hover);
      if (typeof route !== "string") view.path = [route.legs[0]!.from, ...route.legs.map((l) => l.to)];
      const engages = mode.kind !== "disengage" && plan.placements.some((p) => wouldEngage(s, sel, p.pos));
      const stillEngaged = mode.kind === "disengage" && plan.placements.some((p) => wouldEngage(s, sel, p.pos));
      if (engages) {
        view.ghostOk = false;
        return "Only a charge can move into base contact";
      }
      if (stillEngaged) {
        view.ghostOk = false;
        return "Must end out of base contact";
      }
      return `${mode.kind === "advance" ? "Advance" : mode.kind === "disengage" ? "Disengage" : "Move"} ${plan.leaderDistance.toFixed(1)}" of ${mv}"${plan.via ? " via " + (plan.via.includes("ladder") ? "ladder" : "ramp") : ""}`;
    }

    if (mode.kind === "shoot" || mode.kind === "fight") {
      const melee = mode.kind === "fight";
      const pool = melee ? engagedWith(s, sel) : onBoard(s, AI);
      for (const e of pool) view.targets.push({ uid: e.uid, ok: typeof this.bestWeapon(sel, e, melee) !== "string" });
      if (hit && hit.unit.owner !== HUMAN) {
        const b = this.bestWeapon(sel, hit.unit, melee);
        if (typeof b === "string") return b;
        const w = profileOf(sel).weapons[b.index]!;
        for (const a of b.plan.attackers) {
          const near = b.plan.targets.reduce((x, y) => (dist(x.pos, a.model.pos) < dist(y.pos, a.model.pos) ? x : y));
          view.sightLines.push({ from: drawPos(sel, a.model), to: drawPos(hit.unit, near), ok: true });
        }
        const dice = b.plan.attackers.reduce((n, a) => n + a.dice, 0);
        const exp = expectedDamage(s, sel, hit.unit, b.plan, melee);
        return `${w.name}: ${b.plan.attackers.length} model${b.plan.attackers.length > 1 ? "s" : ""}, ${dice} dice hitting on ${b.plan.hitOn}+ · AP${b.plan.ap} · ≈${exp.toFixed(1)} damage`;
      }
      return null;
    }

    if (mode.kind === "charge") {
      const mv = effectiveMove(s, sel);
      view.moveRing = { center: leader.pos, radius: mv + r };
      for (const e of onBoard(s, AI)) view.targets.push({ uid: e.uid, ok: unitGap(sel, e) <= mv + 1 });
      if (hit && hit.unit.owner !== HUMAN) {
        const plan = planCharge(s, sel, hit.unit);
        if (typeof plan === "string") return plan;
        view.ghosts = plan.placements.map((p) => ({ pos: p.pos, radius: r }));
        return `Charge ${profileOf(hit.unit).name} (${plan.leaderDistance.toFixed(1)}"). Chargers get +1 die per model in combat.`;
      }
      return `Click an enemy within ${mv}" to charge`;
    }

    if (mode.kind === "ability") {
      const def = ABILITIES[mode.id];
      if (def.needs === "friendlyUnit" || (def.needs === "friendlyUnitAndPoint" && !this.abilityTarget)) {
        view.friendlyMarks = onBoard(s, HUMAN)
          .filter((f) => (mode.id === "recall" ? f.uid !== sel.uid && unitGap(sel, f) <= (def.range ?? 12) : f.uid === sel.uid || unitGap(sel, f) <= (def.range ?? 3)))
          .map((f) => f.uid);
        return def.needs === "friendlyUnit" ? `${def.name}: click a friendly unit` : `${def.name}: click a friendly unit to bring over`;
      }
      if (mode.id === "barrage") {
        if (this.hover) view.blast = { center: this.hover, radius: 2 };
        view.moveRing = { center: leader.pos, radius: def.range ?? 24 };
        return "Barrage: hits every ground model under the blast, yours too";
      }
      const mover = mode.id === "recall" && this.abilityTarget ? unitById(s, this.abilityTarget)! : sel;
      if (mode.id === "blink") view.moveRing = { center: leader.pos, radius: def.range ?? 10 };
      if (mode.id === "recall") view.moveRing = { center: leader.pos, radius: 4 + r };
      if (this.hover && !hit) {
        const mr = profileOf(mover).baseRadius;
        const plan = planUnitMove(s, mover, aliveModels(mover)[0]!.id, this.hover, { allowance: 0, teleport: true });
        if (typeof plan === "string") {
          view.ghosts = [{ pos: this.hover, radius: mr }];
          view.ghostOk = false;
          return plan;
        }
        view.ghosts = plan.placements.map((p) => ({ pos: p.pos, radius: mr }));
        return `${def.name}: click to teleport here`;
      }
      return def.text;
    }
    return null;
  }

  private renderTooltip(text: string | null): void {
    if (!text || !this.hover) {
      this.tooltip.style.display = "none";
      return;
    }
    const sp = this.renderer.toScreen(this.hover);
    this.tooltip.style.display = "block";
    this.tooltip.innerText = text;
    const maxX = this.els.stage.clientWidth - 270;
    this.tooltip.style.left = `${Math.max(4, Math.min(maxX, sp.x + 18))}px`;
    this.tooltip.style.top = `${sp.y + 18}px`;
  }

  private renderTopbar(): void {
    const s = this.state;
    const phases = (["movement", "assault", "combat", "scoring"] as const)
      .map((p) => `<span class="phase ${s.phase === p ? "current" : ""}">${PHASE_NAMES[p]}</span>`)
      .join("");
    const status = s.over
      ? "Game over"
      : this.aiRunning || s.activePlayer === AI
        ? "AI is thinking…"
        : s.phase === "movement"
          ? "Your move: deploy, move or hunker"
          : s.phase === "assault"
            ? "Your assault: shoot, charge or advance"
            : "Combat: pick an engaged unit to fight";
    const changed = setHTML(this.els.topbar, `
      <span class="logo">SCDMG</span>
      <span class="chip">Round ${s.round}/${s.maxRounds}</span>
      <span class="phases">${phases}</span>
      <span class="score">
        <span class="chip p0 ${s.activePlayer === HUMAN && !s.over ? "active" : ""}">You ${s.players[0].vp}</span>
        <span class="chip p1 ${s.activePlayer === AI && !s.over ? "active" : ""}">AI ${s.players[1].vp}</span>
      </span>
      <span class="status">${esc(status)}</span>
      <span class="spacer"></span>
      <button class="secondary" id="btn-rules">How to play</button>
      <button class="secondary" id="btn-new">New game</button>`);
    if (!changed) return;
    this.els.topbar.querySelector("#btn-rules")!.addEventListener("click", () => showRules());
    this.els.topbar.querySelector("#btn-new")!.addEventListener("click", () => this.onNewGame());
  }

  private renderArmy(): void {
    const s = this.state;
    const el = this.els.sidebar.querySelector("#army")!;
    const me = s.players[HUMAN];
    const ai = s.players[AI];
    const canDeploy = this.humanTurn() && s.phase === "movement";
    const rows = reserves(s, HUMAN)
      .map((u) => {
        const p = profileOf(u);
        const why = canAffordDeploy(s, u);
        const on = this.deployUid === u.uid;
        return `<div class="reserve ${on ? "on" : ""}">
          <span><b>${esc(p.name)}</b> <small>⚙${p.cost} · ◆${p.supply}${u.upgrades.length ? " · " + u.upgrades.map((id) => esc(p.upgrades.find((x) => x.id === id)?.name ?? id)).join(", ") : ""}</small></span>
          <button class="mini" data-deploy="${u.uid}" ${canDeploy && !why ? "" : "disabled"} title="${esc(why ?? "Place it in your zone")}">${on ? "Placing…" : "Deploy"}</button>
        </div>`;
      })
      .join("");
    const changed = setHTML(el, `
      <div class="army-row"><span class="chip p0">You</span> ⚙ ${me.resources} · ◆ ${supplyUsed(s, HUMAN)}/${me.supplyCap} supply</div>
      <div class="army-row"><span class="chip p1">AI</span> ⚙ ${ai.resources} · ◆ ${supplyUsed(s, AI)}/${ai.supplyCap} supply · ${reserves(s, AI).length} in reserve</div>
      ${rows ? `<h3 style="margin-top:6px">Reserves</h3>${rows}` : `<p class="hint">Everything is deployed.</p>`}`);
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
      setHTML(el, `<h3>No unit selected</h3><p class="hint">Click one of your units to activate it, or deploy from reserves. Hover anything to inspect it.</p>`);
      return;
    }
    const p = profileOf(u);
    const alive = aliveModels(u).length;
    const statuses = [
      u.status.acted && "acted",
      u.onBoard && isEngaged(s, u) && "engaged",
      u.status.hunkered && "hunkered",
      u.status.charged && "charged",
      u.status.disengaged && "disengaged",
      u.status.slowedRounds > 0 && "slowed",
      !u.onBoard && "in reserve",
    ].filter(Boolean);
    setHTML(el, `
      <h3>${esc(p.name)} <span class="chip ${u.owner === HUMAN ? "p0" : "p1"}" style="font-size:.75rem">${u.owner === HUMAN ? "You" : "AI"}</span></h3>
      <p class="sub">${esc(FACTIONS[p.faction].name)} · ⚙${p.cost} · ◆${p.supply} · ${alive}/${p.models} models · ${esc(p.blurb)}</p>
      <div class="stats">
        <div>${u.onBoard ? effectiveMove(s, u) : p.move}"<small>Move</small></div>
        <div>${p.hp}<small>HP/model</small></div>
        <div>${p.shield || "–"}<small>Shield</small></div>
        <div>${p.armor <= 6 ? `${p.armor}+` : "–"}<small>Save</small></div>
      </div>
      <div class="tags">${p.keywords.map((k) => `<span class="tag kw" title="${esc(KEYWORD_TEXT[k])}">${esc(k)}</span>`).join("")}</div>
      ${p.weapons.map((w) => `<div class="weapon">⚔ ${esc(weaponLine(w))}</div>`).join("")}
      ${p.abilities.map((a) => `<div class="ability"><b>${esc(ABILITIES[a].name)}</b> <small>(${ABILITIES[a].kind}${ABILITIES[a].usesPerGame ? `, ${ABILITIES[a].usesPerGame - (u.abilityUses[a] ?? 0)} left` : ""})</small>: ${esc(ABILITIES[a].text)}</div>`).join("")}
      ${statuses.length ? `<div class="tags">${statuses.map((x) => `<span class="tag">${x}</span>`).join("")}</div>` : ""}`);
  }

  private renderActions(sel: Unit | undefined): void {
    const el = this.els.sidebar.querySelector("#actions")!;
    const s = this.state;
    if (!this.humanTurn()) {
      setHTML(el, `<p class="hint">${s.over ? "The battle is over." : "Waiting for the AI…"}</p>`);
      return;
    }
    const passBtn = `<button data-act="pass" class="secondary">⏭ Pass rest of ${PHASE_NAMES[s.phase].toLowerCase()} phase [P]</button>`;
    if (!sel) {
      const n = eligibleUnits(s, HUMAN).length;
      const hint =
        this.mode.kind === "deploy"
          ? "Click inside your shaded zone to place the unit. The rest of the squad forms up around that spot."
          : n
            ? `${n} unit${n > 1 ? "s" : ""} can still act this phase. Click one to activate it.`
            : s.phase === "movement" && reserves(s, HUMAN).some((u) => !canAffordDeploy(s, u))
              ? "Deploy from your reserves, or pass."
              : "Nothing left to activate. Pass to move on.";
      if (setHTML(el, `<p class="hint" style="margin:0">${hint}</p>${passBtn}`)) this.bindActions(el, undefined);
      return;
    }
    const p = profileOf(sel);
    const btn = (act: string, label: string, on: boolean, extra = "", disabled = false) =>
      `<button data-act="${act}" ${extra} class="${on ? "selected" : ""}" ${disabled ? "disabled" : ""}>${label}</button>`;
    const out: string[] = [];
    const m = this.mode;
    const abilityButtons = () =>
      p.abilities
        .filter((a) => ABILITIES[a].kind === "active" && ABILITIES[a].phase === s.phase)
        .map((a) => {
          const def = ABILITIES[a];
          const left = def.usesPerGame === undefined ? null : def.usesPerGame - (sel.abilityUses[a] ?? 0);
          return btn("ability", `✨ ${def.name}${left !== null ? ` (${left})` : ""}`, m.kind === "ability" && m.id === a, `data-ab="${a}"`, left === 0);
        });
    if (s.phase === "movement") {
      out.push(`<p class="hint" style="margin:0">Click a model to make it the leader (★), then click where it should go. The rest follow within 2".</p>`);
      if (isEngaged(s, sel)) out.push(btn("disengage", `🏃 Disengage (up to ${effectiveMove(s, sel)}")`, m.kind === "disengage"));
      else out.push(btn("move", `🏃 Move (up to ${effectiveMove(s, sel)}")`, m.kind === "move"));
      out.push(...abilityButtons());
      out.push(btn("hunker", "🧱 Hunker down (+1 save vs shots) [H]", false));
      out.push(btn("hold", "✋ Hold position", false));
    } else if (s.phase === "assault") {
      p.weapons.forEach((w, i) => {
        if (w.melee) return;
        const blocked = sel.status.disengaged && !p.keywords.includes("light");
        out.push(btn("shoot", `🎯 ${esc(w.name)} (${w.range}")`, m.kind === "shoot" && m.weapon === i, `data-w="${i}"`, blocked));
      });
      if (p.weapons.some((w) => w.melee)) out.push(btn("charge", `💥 Charge (up to ${effectiveMove(s, sel)}")`, m.kind === "charge", "", sel.status.disengaged));
      out.push(btn("advance", `🏃 Advance (up to ${effectiveMove(s, sel)}")`, m.kind === "advance", "", sel.status.disengaged));
      out.push(...abilityButtons());
      out.push(btn("hunker", "🧱 Hunker down [H]", false));
      out.push(btn("hold", "✋ Hold", false));
    } else if (s.phase === "combat") {
      p.weapons.forEach((w, i) => {
        if (w.melee) out.push(btn("fight", `⚔ ${esc(w.name)}`, m.kind === "fight" && m.weapon === i, `data-w="${i}"`));
      });
      out.push(`<p class="hint" style="margin:0">Click an engaged enemy to fight it.</p>`);
      out.push(btn("hold", "✋ Don't fight", false));
    }
    out.push(`<button data-act="cancel" class="secondary">Cancel [Esc]</button>`, passBtn);
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
        if (a === "move" || a === "advance" || a === "disengage" || a === "charge") this.mode = { kind: a };
        else if (a === "shoot" || a === "fight") this.mode = { kind: a, weapon: Number(b.dataset.w) };
        else if (a === "ability") {
          this.mode = { kind: "ability", id: b.dataset.ab as AbilityId };
          this.abilityTarget = null;
        }
        this.refresh();
      }),
    );
  }

  private log(html: string, owner?: number): void {
    const el = this.els.sidebar.querySelector("#log")!;
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
    const title = s.winner === "draw" ? "It's a draw!" : s.winner === HUMAN ? "Victory!" : "Defeat!";
    const overlay = document.getElementById("overlay")!;
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
    overlay.querySelector("#go-close")!.addEventListener("click", () => overlay.classList.remove("show"));
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
        <li><b>Assault:</b> shoot, charge into base contact, advance, hunker, or use an assault ability. Engaged units sit this out.</li>
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
      <p class="hint">Keys: Esc cancels, H hunkers, P passes the rest of the phase. Hover enemies with a unit selected to see the odds.</p>
      <button id="rules-close">Got it</button>
    </div>`;
  overlay.classList.add("show");
  overlay.querySelector("#rules-close")!.addEventListener("click", () => overlay.classList.remove("show"));
}

