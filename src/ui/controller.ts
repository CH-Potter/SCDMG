// Glue between the pure engine, the Pixi board and the DOM HUD. The human is player 0; the AI is player 1.

import { aiCommands, needsEnd } from "../engine/ai";
import { FACTIONS, profileOf } from "../engine/data/factions";
import { applyCommand, createGame, type GameSetup } from "../engine/game";
import { dist, towards } from "../engine/geometry";
import {
  canActivate,
  canEntrench,
  checkAttack,
  checkMove,
  expectedDamage,
  healTargets,
  unitById,
} from "../engine/rules";
import type { Command, GameEvent, GameState, Unit, Vec } from "../engine/types";
import { ABILITY_TEXT, attackPreview, describeEvent, esc, weaponLine } from "./describe";
import { BoardRenderer, type RenderView } from "./renderer";

const HUMAN = 0;
const AI = 1;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Mode = { kind: "move" } | { kind: "attack"; weapon: number } | { kind: "heal" };

export class Controller {
  private state: GameState;
  private selected: string | null = null;
  private mode: Mode = { kind: "move" };
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
    this.log(
      `<b>Battle at Dustbowl Crossing!</b> You (${esc(FACTIONS[setup.factions[0]].name)}, cyan) vs the AI (${esc(FACTIONS[setup.factions[1]].name)}, red). Hold the ★ objectives at the end of each round to score.`,
    );
    this.refresh();
  }

  destroy(): void {
    this.generation++;
    this.tooltip.remove();
    window.onkeydown = null;
  }

  // ---------- input ----------

  private humanTurn(): boolean {
    return !this.state.over && !this.aiRunning && this.state.activePlayer === HUMAN;
  }

  private unitAt(p: Vec): Unit | undefined {
    return this.state.units.find((u) => u.alive && dist(u.pos, p) <= profileOf(u.profileId).baseRadius + 0.15);
  }

  private sel(): Unit | undefined {
    return this.selected ? unitById(this.state, this.selected) : undefined;
  }

  private click(p: Vec): void {
    if (!this.humanTurn()) return;
    const u = this.unitAt(p);
    const sel = this.sel();
    if (!sel) {
      if (u && canActivate(this.state, u)) this.select(u.uid);
      return;
    }
    if (this.mode.kind === "heal") {
      if (u && healTargets(this.state, sel).some((t) => t.uid === u.uid)) {
        this.issue({ type: "heal", uid: sel.uid, target: u.uid });
      }
      return;
    }
    if (u && u.owner !== HUMAN) {
      const w = this.chooseWeapon(sel, u);
      if (w !== null) this.issue({ type: "attack", uid: sel.uid, target: u.uid, weapon: w });
      else this.flash(this.attackHint(sel, u));
      return;
    }
    if (u && u.owner === HUMAN) {
      if (u.uid !== sel.uid && !this.state.activation && canActivate(this.state, u)) this.select(u.uid);
      return;
    }
    if (this.mode.kind === "move") {
      const to = towards(sel.pos, p, profileOf(sel.profileId).move);
      const err = checkMove(this.state, sel, to);
      if (err) this.flash(err);
      else this.issue({ type: "move", uid: sel.uid, to });
    }
  }

  private key(e: KeyboardEvent): void {
    if (!this.humanTurn()) return;
    const sel = this.sel();
    if (e.key === "Escape") {
      if (this.mode.kind !== "move") this.mode = { kind: "move" };
      else if (!this.state.activation) this.selected = null;
      this.refresh();
    } else if ((e.key === "e" || e.key === "E") && sel) {
      this.issue({ type: "end", uid: sel.uid });
    }
  }

  private select(uid: string): void {
    this.selected = uid;
    this.mode = { kind: "move" };
    this.refresh();
  }

  /** The weapon to use: the one picked in the HUD, else the legal one with the best expected damage. */
  private chooseWeapon(a: Unit, t: Unit): number | null {
    const weapons = profileOf(a.profileId).weapons;
    if (this.mode.kind === "attack") {
      return checkAttack(this.state, a, t, weapons[this.mode.weapon]!) === null ? this.mode.weapon : null;
    }
    let best: number | null = null;
    let bestExp = -1;
    weapons.forEach((w, i) => {
      if (checkAttack(this.state, a, t, w) !== null) return;
      const exp = expectedDamage(this.state, a, t, w);
      if (exp > bestExp) {
        bestExp = exp;
        best = i;
      }
    });
    return best;
  }

  private attackHint(a: Unit, t: Unit): string {
    const weapons = profileOf(a.profileId).weapons;
    const list = this.mode.kind === "attack" ? [weapons[this.mode.weapon]!] : weapons;
    return list.map((w) => attackPreview(this.state, a, t, w).text).join("\n");
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
    if (this.state.activation?.uid !== cmd.uid) {
      this.selected = null;
      this.mode = { kind: "move" };
    } else if (cmd.type !== "move") {
      this.mode = { kind: "move" };
    }
    this.refresh();
    void this.runAi();
    return true;
  }

  private handleEvents(before: GameState, events: GameEvent[]): void {
    for (const e of events) {
      const text = describeEvent(this.state, e);
      const owner = "uid" in e ? unitById(before, e.uid)?.owner : undefined;
      if (text) this.log(text, owner);
      if (e.type === "attacked") {
        const t = unitById(this.state, e.target)!;
        this.renderer.floatText(t.pos, e.killed ? "KO!" : e.damage ? `-${e.damage}` : "Whiff!", e.damage ? 0xff6b6b : 0xffffff);
      } else if (e.type === "healed") {
        this.renderer.floatText(unitById(this.state, e.target)!.pos, "+1", 0x6fdc6a);
      } else if (e.type === "entrenched") {
        this.renderer.floatText(unitById(this.state, e.uid)!.pos, "Dug in!", 0xffc83d);
      } else if (e.type === "roundEnded") {
        for (const uid of e.healed) this.renderer.floatText(unitById(this.state, uid)!.pos, "+1", 0x6fdc6a);
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
        await sleep(450);
        if (gen !== this.generation) return;
        const cmds = aiCommands(this.state);
        if (cmds.length === 0) break;
        for (const cmd of cmds) {
          if (cmd.type === "end" && !needsEnd(this.state, cmd.uid)) break;
          this.selected = cmd.uid;
          const r = applyCommand(this.state, cmd);
          if (!r.ok) {
            console.error("AI command rejected", cmd, r.error);
            break;
          }
          const before = this.state;
          this.state = r.state;
          this.handleEvents(before, r.events);
          this.refresh();
          await sleep(cmd.type === "end" ? 150 : 550);
          if (gen !== this.generation) return;
        }
        this.selected = null;
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
    const hovered = this.hover ? this.unitAt(this.hover) : undefined;
    const view: RenderView = { state: s, selected: this.selected, moveRing: null, ghost: null, targets: [], losLine: null, heals: [] };
    let tip: string | null = null;

    if (sel && this.humanTurn()) {
      const p = profileOf(sel.profileId);
      if (this.mode.kind === "move") {
        view.moveRing = { center: sel.pos, radius: p.move };
        if (this.hover && !hovered) {
          const to = towards(sel.pos, this.hover, p.move);
          const err = checkMove(s, sel, to);
          view.ghost = { pos: to, radius: p.baseRadius, ok: !err };
          tip = err ?? `Move ${dist(sel.pos, to).toFixed(1)}"`;
        }
      }
      if (this.mode.kind === "heal") {
        view.heals = healTargets(s, sel).map((u) => u.uid);
      } else if (!this.state.activation?.attacked) {
        for (const e of s.units.filter((u) => u.alive && u.owner !== HUMAN)) {
          view.targets.push({ uid: e.uid, ok: this.chooseWeapon(sel, e) !== null });
        }
      }
      if (hovered && hovered.owner !== HUMAN) {
        const w = this.chooseWeapon(sel, hovered);
        const weapons = profileOf(sel.profileId).weapons;
        view.losLine = { from: sel.pos, to: hovered.pos, ok: w !== null };
        tip = w !== null ? attackPreview(s, sel, hovered, weapons[w]!).text : this.attackHint(sel, hovered);
      }
    }
    this.renderer.render(view);
    this.renderTooltip(tip);
    this.renderTopbar();
    this.renderCard(hovered ?? sel);
    this.renderActions(sel);
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
    this.tooltip.style.left = `${Math.min(maxX, sp.x + 18)}px`;
    this.tooltip.style.top = `${sp.y + 18}px`;
  }

  private renderTopbar(): void {
    const s = this.state;
    const status = s.over
      ? "Game over"
      : this.aiRunning || s.activePlayer === AI
        ? "AI is thinking…"
        : s.activation
          ? `Activating: ${s.activation.actionsLeft} action${s.activation.actionsLeft === 1 ? "" : "s"} left`
          : "Your turn: pick a unit";
    this.els.topbar.innerHTML = `
      <span class="logo">SCDMG</span>
      <span class="chip">Round ${s.round}/${s.maxRounds}</span>
      <span class="score">
        <span class="chip p0 ${s.activePlayer === HUMAN && !s.over ? "active" : ""}">You ${s.score[0]}</span>
        <span class="chip p1 ${s.activePlayer === AI && !s.over ? "active" : ""}">AI ${s.score[1]}</span>
      </span>
      <span>${esc(status)}</span>
      <span class="spacer"></span>
      <button class="secondary" id="btn-rules">How to play</button>
      <button class="secondary" id="btn-new">New game</button>`;
    this.els.topbar.querySelector("#btn-rules")!.addEventListener("click", () => showRules());
    this.els.topbar.querySelector("#btn-new")!.addEventListener("click", () => this.onNewGame());
  }

  private renderCard(u: Unit | undefined): void {
    const el = this.els.sidebar.querySelector("#card")!;
    if (!u) {
      el.innerHTML = `<h3>No unit selected</h3><p class="hint">Click one of your cyan units to activate it. Hover anything to inspect it.</p>`;
      return;
    }
    const p = profileOf(u.profileId);
    el.innerHTML = `
      <h3>${esc(p.name)} <span class="chip ${u.owner === HUMAN ? "p0" : "p1"}" style="font-size:.75rem">${u.owner === HUMAN ? "You" : "AI"}</span></h3>
      <p class="sub">${esc(FACTIONS[p.faction].name)} · ${p.cost} pts · ${esc(p.blurb)}</p>
      <div class="stats">
        <div>${p.move}"<small>Move</small></div>
        <div>${u.hp}/${p.hp}<small>HP</small></div>
        <div>${p.shield ? `${u.shield}/${p.shield}` : "–"}<small>Shield</small></div>
        <div>${p.armor <= 6 ? `${p.armor}+` : "–"}<small>Save</small></div>
      </div>
      ${p.weapons.map((w) => `<div class="weapon">⚔ ${esc(weaponLine(w))}</div>`).join("")}
      <div class="tags">
        ${p.abilities.map((a) => `<span class="tag" title="${esc(ABILITY_TEXT[a])}">${esc(a)}</span>`).join("")}
        ${u.dugIn ? `<span class="tag">dug in</span>` : ""}
        ${u.activated ? `<span class="tag">activated</span>` : ""}
      </div>`;
  }

  private renderActions(sel: Unit | undefined): void {
    const el = this.els.sidebar.querySelector("#actions")!;
    const s = this.state;
    if (!sel || !this.humanTurn()) {
      el.innerHTML = `<p class="hint">${s.over ? "The battle is over." : this.humanTurn() ? "Select a unit to see its actions. Each unit gets 2 actions per activation: move, attack (once), or a special." : "Waiting for the AI…"}</p>`;
      return;
    }
    const p = profileOf(sel.profileId);
    const act = s.activation?.uid === sel.uid ? s.activation : null;
    const actionsLeft = act ? act.actionsLeft : 2;
    const attacked = !!act?.attacked;
    const buttons: string[] = [];
    buttons.push(`<p class="hint" style="margin:0">${actionsLeft} action${actionsLeft === 1 ? "" : "s"} left. Click the board to move, or an enemy to attack.</p>`);
    buttons.push(`<button data-act="move" class="${this.mode.kind === "move" ? "selected" : ""}">🏃 Move (up to ${p.move}")</button>`);
    p.weapons.forEach((w, i) => {
      const on = this.mode.kind === "attack" && this.mode.weapon === i;
      buttons.push(`<button data-act="attack" data-w="${i}" class="${on ? "selected" : ""}" ${attacked ? "disabled" : ""}>⚔ ${esc(w.name)} (${w.melee ? "melee" : `${w.range}"`})</button>`);
    });
    if (p.abilities.includes("entrench")) {
      buttons.push(`<button data-act="entrench" ${canEntrench(s, sel) ? "" : "disabled"}>🧱 Entrench (+1 save)</button>`);
    }
    if (p.abilities.includes("medic")) {
      const can = healTargets(s, sel).length > 0;
      buttons.push(`<button data-act="heal" class="${this.mode.kind === "heal" ? "selected" : ""}" ${can ? "" : "disabled"}>🩹 Patch up (heal 1)</button>`);
    }
    buttons.push(`<button data-act="end" class="secondary">✋ ${act ? "End activation" : "Hold (skip this unit)"} [E]</button>`);
    if (!act) buttons.push(`<button data-act="cancel" class="secondary">Cancel selection [Esc]</button>`);
    el.innerHTML = buttons.join("");
    el.querySelectorAll<HTMLButtonElement>("button").forEach((b) =>
      b.addEventListener("click", () => {
        const a = b.dataset.act;
        if (a === "move") this.mode = { kind: "move" };
        else if (a === "attack") this.mode = { kind: "attack", weapon: Number(b.dataset.w) };
        else if (a === "heal") this.mode = { kind: "heal" };
        else if (a === "entrench") return void this.issue({ type: "entrench", uid: sel.uid });
        else if (a === "end") return void this.issue({ type: "end", uid: sel.uid });
        else if (a === "cancel") this.selected = null;
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
        <p class="tagline">Final score: you ${s.score[0]}, AI ${s.score[1]}</p>
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
    <div class="modal" style="max-width:640px">
      <h1>How to play</h1>
      <p class="tagline">Five rounds. Most objective points wins, or wipe out the other side.</p>
      <ul>
        <li><b>Alternate activations.</b> Players take turns activating one unit at a time. When everything has activated, the round ends.</li>
        <li><b>Two actions per activation:</b> Move (up to the unit's Move, in a straight line), Attack (once per activation), or a special like Entrench or Patch up. Moving twice is a dash.</li>
        <li><b>Shooting</b> needs range (measured base edge to base edge) and line of sight; buildings block sight. You can't shoot while an enemy is within 1".</li>
        <li><b>Melee</b> needs an enemy within 1". Move into contact, then attack.</li>
        <li><b>Rolling:</b> roll the weapon's dice; each one at or above its hit number is a hit. The defender rolls a save for each hit. AP makes saves worse; cover (shooting through or into craters and scrub) and being dug in make them better. Every failed save deals the weapon's damage, shields first.</li>
        <li><b>Scoring:</b> at the end of each round, each ★ objective goes to whoever has more units touching its circle: 1 point each.</li>
        <li><b>End of round:</b> shields recharge 1, and Regen units that took no damage heal 1.</li>
      </ul>
      <p class="hint">Tip: hover an enemy with a unit selected to see the odds before you commit. Esc cancels; E ends an activation.</p>
      <button id="rules-close">Got it</button>
    </div>`;
  overlay.classList.add("show");
  overlay.querySelector("#rules-close")!.addEventListener("click", () => overlay.classList.remove("show"));
}
