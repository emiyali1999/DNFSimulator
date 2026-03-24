/**
 * 状态机可视化组件（运行时）—— 动态视图
 *
 * 布局策略：
 *   - 以当前状态为中心，周围放射排列所有可到达的下一状态
 *   - 上一个状态显示在左上角（淡化），带一条指向当前状态的来源箭头
 *   - 状态切换时重新计算布局并刷新
 *   - 整体自适应屏幕右上角 25% 区域
 *
 * 使用方法：
 *   1. 在 Canvas 下创建空节点，挂载此组件
 *   2. 将 targetStateMachine 指向角色的 StateMachineComponent
 */

import StateMachineComponent from "./StateMachineComponent";
import StateMachineConfig, { ConditionType, OutgoingTransition, StateNodeConfig } from "./StateMachineConfig";
import BattleSystem from "../Battle/BattleSystem";
import { SkillBoxShape } from "../Battle/SkillBox";

const { ccclass, property } = cc._decorator;

const PADDING = 14;

interface Pos { x: number; y: number; }

@ccclass
export default class StateMachineVisualizer extends cc.Component {

    @property(StateMachineComponent)
    targetStateMachine: StateMachineComponent = null;

    /**
     * 斜投影比例，须与 PlayerController.perspectiveRatio 保持一致
     * 用于将 worldZ（深度）映射到屏幕 Y，从而正确定位 SkillBox 边框
     */
    @property
    perspectiveRatio: number = 0.5;

    /**
     * 深度可视化 X 系数（仅影响 SkillBox 边框绘制，不影响游戏逻辑）
     * 给深度方向附加一个水平偏移，使近面/远面产生横向位移，形成斜等测投影效果
     * 0 = 纯 Y 轴偏移（深度边为垂直线，视觉上扁平）
     * 0.3 = 近面右偏、远面左偏，深度边呈斜线，立体感明显
     */
    @property
    depthXRatio: number = 0.3;

    private _graphics: cc.Graphics = null;
    private _labelNodes: cc.Node[] = [];    // 每帧重建，统一管理

    private _currentState: string = "";
    private _prevState: string = "";

    // 运行时算出的尺寸
    private _areaW: number = 0;
    private _areaH: number = 0;
    private _curRadius: number = 28;    // 当前状态节点半径
    private _nextRadius: number = 20;   // 下一状态节点半径
    private _prevRadius: number = 16;   // 上一状态节点半径

    /** SkillBox 边框绘制（Visualizer 子节点，Canvas 坐标对齐） */
    private _boxGraphics: cc.Graphics = null;
    /** 玩家中心 Debug 球（玩家节点子节点，渲染在玩家精灵之上） */
    private _sphereGraphics: cc.Graphics = null;

    /** Debug 模式开关（O 键切换） */
    private _debugEnabled: boolean = true;
    private _oKeyDown: boolean = false;

    onLoad() {
        this._graphics = this.node.addComponent(cc.Graphics);

        // SkillBox Debug 独立子节点，挂在 Visualizer 下，渲染顺序在 TestPlayer 之后。
        // 每帧抵消 Visualizer 的偏移，使子节点对齐 Canvas (0,0)，直接用 Canvas 本地坐标绘制。
        const boxNode = new cc.Node("SkillBoxDebug");
        this._boxGraphics = boxNode.addComponent(cc.Graphics);
        this.node.addChild(boxNode);

        if (!this.targetStateMachine) {
            cc.warn("[Viz] targetStateMachine 未赋值");
            return;
        }

        this.targetStateMachine.node.on("state-changed", this._onStateChanged, this);
        this.schedule(this._tryInit, 0.2);
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, this._onKeyDown, this);
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_UP,   this._onKeyUp,   this);
    }

    onDestroy() {
        if (this.targetStateMachine) {
            this.targetStateMachine.node.off("state-changed", this._onStateChanged, this);
        }
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_DOWN, this._onKeyDown, this);
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_UP,   this._onKeyUp,   this);
    }

    update(_dt: number) {
        if (this._boxGraphics && cc.isValid(this._boxGraphics.node)) {
            this._boxGraphics.node.setPosition(-this.node.x, -this.node.y);
        }

        if (this._debugEnabled) {
            this._drawSkillBoxes();
        } else {
            // 关闭时清空两个画布
            if (this._boxGraphics)    this._boxGraphics.clear();
            if (this._sphereGraphics) this._sphereGraphics.clear();
        }
    }

    private _onKeyDown(e: cc.Event.EventKeyboard) {
        if (e.keyCode === cc.macro.KEY.o) {
            if (!this._oKeyDown) {
                this._oKeyDown = true;
                this._debugEnabled = !this._debugEnabled;
                cc.log(`[Viz] Debug ${this._debugEnabled ? "ON" : "OFF"}`);
            }
        }
    }

    private _onKeyUp(e: cc.Event.EventKeyboard) {
        if (e.keyCode === cc.macro.KEY.o) {
            this._oKeyDown = false;
        }
    }

    // ── 初始化 ────────────────────────────────────────────────

    private _tryInit() {
        if (!this.targetStateMachine || !this.targetStateMachine.isLoaded()) return;
        this.unschedule(this._tryInit);
        this._setupArea();
        this._currentState = this.targetStateMachine.getCurrentState();
        this._fullRedraw();

        // 小球挂在玩家节点下：玩家自身 Sprite 先渲染，子节点后渲染，保证在精灵之上
        if (!this._sphereGraphics) {
            const sn = new cc.Node("PlayerDebugSphere");
            this._sphereGraphics = sn.addComponent(cc.Graphics);
            this.targetStateMachine.node.addChild(sn);
        }
    }

    private _onStateChanged(data: { from: string; to: string }) {
        this._prevState    = data.from;
        this._currentState = data.to;
        if (this._areaW === 0) {
            this._setupArea();
        }
        this._fullRedraw();
    }

    /** 确定区域大小并定位节点到右上角 */
    private _setupArea() {
        const W = cc.winSize.width;
        const H = cc.winSize.height;
        this._areaW = W / 2;
        this._areaH = H / 2;
        this.node.setContentSize(this._areaW, this._areaH);
        this.node.setPosition(W / 4, H / 4);

        // 根据可用空间动态设定节点半径
        const minDim = Math.min(this._areaW, this._areaH);
        this._curRadius  = Math.min(30, minDim * 0.12);
        this._nextRadius = Math.min(22, minDim * 0.09);
        this._prevRadius = Math.min(16, minDim * 0.07);
    }

    // ── 全量刷新（布局 + 绘制） ───────────────────────────────

    private _fullRedraw() {
        // 清理旧标签
        for (let i = 0; i < this._labelNodes.length; i++) {
            this._labelNodes[i].destroy();
        }
        this._labelNodes = [];

        this._graphics.clear();

        const config = this.targetStateMachine ? this.targetStateMachine.getConfig() : null;
        if (!config || !this._currentState) return;

        // ── 计算布局 ──────────────────────────────────────────

        const layout = this._buildLayout(config);

        const g = this._graphics;
        const aW = this._areaW;
        const aH = this._areaH;

        // 背景面板（低透明度，不遮挡玩家）
        g.fillColor = cc.color(8, 10, 20, 70);
        g.roundRect(-aW / 2, -aH / 2, aW, aH, 10);
        g.fill();
        g.strokeColor = cc.color(80, 90, 140, 90);
        g.lineWidth = 1;
        g.roundRect(-aW / 2, -aH / 2, aW, aH, 10);
        g.stroke();

        // 标题
        this._addLabel(
            -aW / 2 + PADDING + 4,
            aH / 2 - PADDING - 8,
            "STATE MACHINE",
            10,
            cc.color(120, 140, 200, 180)
        );

        // ── 绘制来源箭头（上一状态 → 当前） ──────────────────

        if (this._prevState && layout.prevPos && layout.curPos) {
            this._drawArrow(
                g,
                layout.prevPos.x, layout.prevPos.y,
                layout.curPos.x,  layout.curPos.y,
                this._prevRadius, this._curRadius,
                cc.color(140, 140, 140, 140),
                false
            );
        }

        // ── 绘制去往下一状态的箭头 ────────────────────────────

        for (let i = 0; i < layout.outgoing.length; i++) {
            const item = layout.outgoing[i];
            const fp = layout.curPos;
            const tp = item.pos;

            // 是否当前可打断（canInterrupt）
            const dashed = !item.transition.canInterrupt;
            const col = cc.color(255, 220, 80, 200);
            this._drawArrow(g, fp.x, fp.y, tp.x, tp.y, this._curRadius, this._nextRadius, col, dashed);

            // 条件标签（显示在箭头中点上方，避免与节点重叠）
            const label = this._conditionLabel(item.transition, item.isGlobal);
            if (label) {
                this._addLabel(
                    (fp.x + tp.x) / 2,
                    (fp.y + tp.y) / 2 + 9,
                    label,
                    Math.max(7, Math.round(this._nextRadius * 0.44)),
                    cc.color(255, 240, 120, 230)
                );
            }
        }

        // ── 绘制上一状态节点 ──────────────────────────────────

        if (this._prevState && layout.prevPos) {
            this._drawStateNode(
                g, layout.prevPos.x, layout.prevPos.y,
                this._prevRadius,
                cc.color(60, 65, 80, 180),
                cc.color(120, 120, 140, 160),
                false
            );
            this._addLabel(
                layout.prevPos.x, layout.prevPos.y,
                this._prevState,
                Math.max(8, Math.round(this._prevRadius * 0.55)),
                cc.color(160, 160, 180, 200)
            );
        }

        // ── 绘制下一状态节点 ──────────────────────────────────

        for (let i = 0; i < layout.outgoing.length; i++) {
            const item = layout.outgoing[i];
            const isHot = item.transition.conditionType === ConditionType.Immediate;
            this._drawStateNode(
                g, item.pos.x, item.pos.y,
                this._nextRadius,
                isHot ? cc.color(60, 80, 40, 220) : cc.color(40, 55, 100, 220),
                isHot ? cc.color(120, 220, 80, 220) : cc.color(140, 160, 230, 200),
                false
            );
            // 状态名显示在节点圆圈右侧，左对齐，避免与圆圈重叠
            this._addLabel(
                item.pos.x + this._nextRadius + 5,
                item.pos.y,
                item.state,
                Math.max(8, Math.round(this._nextRadius * 0.52)),
                isHot ? cc.color(180, 255, 120, 255) : cc.color(200, 210, 255, 230),
                cc.Label.HorizontalAlign.LEFT
            );
        }

        // ── 绘制当前状态节点（最后绘制，保证在最上层） ─────────

        this._drawStateNode(
            g, layout.curPos.x, layout.curPos.y,
            this._curRadius,
            cc.color(220, 140, 20, 255),
            cc.color(255, 210, 60, 255),
            true
        );
        this._addLabel(
            layout.curPos.x, layout.curPos.y,
            this._currentState,
            Math.max(9, Math.round(this._curRadius * 0.48)),
            cc.color(255, 255, 120, 255)
        );
    }

    // ── SkillBox 边框绘制 ─────────────────────────────────────

    /**
     * 每帧重绘所有活跃 SkillBox 的边框
     *
     * 坐标系：Canvas 本地坐标（原点 = 屏幕中心）
     *   screenX = worldX
     *   screenY = worldY + worldZ × perspectiveRatio
     *
     * Box 绘制策略：画前面、后面（深度偏移）、四条连接边，形成透视线框效果
     * Sphere 绘制策略：画椭圆（水平半径 = radius，竖直半径 = radius × perspectiveRatio）
     */
    private _drawSkillBoxes() {
        const g = this._boxGraphics;
        if (!g) return;
        g.clear();

        // 玩家 Debug 球：在玩家子节点上绘制，坐标为玩家本地(0,0)即锚点位置
        if (this._sphereGraphics && cc.isValid(this._sphereGraphics.node)) {
            const sg = this._sphereGraphics;
            sg.clear();
            sg.strokeColor = cc.color(80, 255, 255, 255);
            sg.fillColor   = cc.color(80, 255, 255, 180);
            sg.lineWidth = 2;
            sg.circle(0, 0, 6);
            sg.fill();
            sg.circle(0, 0, 6);
            sg.stroke();
            sg.strokeColor = cc.color(80, 255, 255, 200);
            sg.lineWidth = 1;
            sg.moveTo(-12, 0); sg.lineTo(12, 0);
            sg.moveTo(0, -12); sg.lineTo(0, 12);
            sg.stroke();
        }

        const battle = BattleSystem.instance;
        if (!battle) return;

        const boxes = battle.getActiveBoxes();
        if (boxes.length === 0) return;

        const ratio = this.perspectiveRatio;

        for (let i = 0; i < boxes.length; i++) {
            const box = boxes[i];

            // 盒子中心直接用 Canvas 本地坐标
            const cx = box.worldX;
            const cy = box.worldY + box.worldZ * ratio;

            if (box.shapeType === SkillBoxShape.Sphere) {
                // 球体：椭圆（深度压缩竖轴）
                g.strokeColor = cc.color(255, 80, 80, 220);
                g.lineWidth = 2;
                g.ellipse(cx, cy, box.radius * 2, box.radius * 2 * ratio || box.radius * 2);
                g.stroke();
                // 十字辅助线
                g.strokeColor = cc.color(255, 80, 80, 100);
                g.lineWidth = 1;
                g.moveTo(cx - box.radius, cy);
                g.lineTo(cx + box.radius, cy);
                g.moveTo(cx, cy - box.radius);
                g.lineTo(cx, cy + box.radius);
                g.stroke();
            } else {
                // 长方体：斜等测投影（cabinet oblique）
                //   Z 轴在屏幕上映射为：Y 方向 perspectiveRatio，X 方向 depthXRatio
                //   近面（低 Z）相对盒子中心：右偏 +halfDx、下偏 -halfDz
                //   远面（高 Z）相对盒子中心：左偏 -halfDx、上偏 +halfDz
                const hw     = box.sizeX * 0.5;
                const hh     = box.sizeY * 0.5;
                const halfDz = box.sizeZ * ratio            * 0.5;
                const halfDx = box.sizeZ * this.depthXRatio * 0.5;

                // 近面（near face）中心
                const ncx = cx + halfDx;
                const ncy = cy - halfDz;
                // 远面（far face）中心
                const fcx = cx - halfDx;
                const fcy = cy + halfDz;

                // 近面四角
                const nl = ncx - hw;  const nr = ncx + hw;
                const nb = ncy - hh;  const nt = ncy + hh;
                // 远面四角
                const fl = fcx - hw;  const fr = fcx + hw;
                const fb = fcy - hh;  const ft = fcy + hh;

                // ① 远面（先画）
                g.strokeColor = cc.color(255, 100, 100, 190);
                g.lineWidth = 1.5;
                g.moveTo(fl, fb); g.lineTo(fr, fb);
                g.lineTo(fr, ft); g.lineTo(fl, ft);
                g.lineTo(fl, fb);
                g.stroke();

                // ② 四条深度斜边
                g.strokeColor = cc.color(255, 140, 80, 200);
                g.lineWidth = 1;
                g.moveTo(nl, nb); g.lineTo(fl, fb);
                g.moveTo(nr, nb); g.lineTo(fr, fb);
                g.moveTo(nl, nt); g.lineTo(fl, ft);
                g.moveTo(nr, nt); g.lineTo(fr, ft);
                g.stroke();

                // ③ 近面（最亮，最后画）
                g.strokeColor = cc.color(255, 80, 80, 240);
                g.lineWidth = 2;
                g.moveTo(nl, nb); g.lineTo(nr, nb);
                g.lineTo(nr, nt); g.lineTo(nl, nt);
                g.lineTo(nl, nb);
                g.stroke();

                // ④ 中心十字辅助线
                g.strokeColor = cc.color(255, 80, 80, 70);
                g.lineWidth = 1;
                g.moveTo(ncx, ncy - hh); g.lineTo(fcx, fcy + hh);
                g.moveTo(nl, ncy);       g.lineTo(nr, ncy);
                g.stroke();
            }
        }
    }

    // ── 布局计算 ──────────────────────────────────────────────

    private _buildLayout(config: StateMachineConfig): {
        curPos: Pos;
        prevPos: Pos;
        outgoing: Array<{ state: string; pos: Pos; transition: OutgoingTransition; isGlobal: boolean }>;
    } {
        const aW = this._areaW;
        const aH = this._areaH;
        const availW = aW - PADDING * 2;
        const availH = aH - PADDING * 2;

        // 收集从当前状态出发的所有转换（本状态 + 全局），去重保留优先级最高的
        const bestMap: { [toState: string]: OutgoingTransition } = {};
        const isGlobalMap: { [toState: string]: boolean } = {};

        const stateCfg = config.findState(this._currentState);
        const localList = stateCfg ? stateCfg.transitions : [];
        const globalList = config.globalTransitions;

        const lists: OutgoingTransition[][] = [localList, globalList];
        for (let li = 0; li < lists.length; li++) {
            const isGlobal = li === 1;
            const list = lists[li];
            for (let i = 0; i < list.length; i++) {
                const t = list[i];
                if (t.toState === this._currentState) continue;
                const existing = bestMap[t.toState];
                if (!existing || t.priority > existing.priority) {
                    bestMap[t.toState] = t;
                    isGlobalMap[t.toState] = isGlobal;
                }
            }
        }
        const targets = Object.keys(bestMap);
        const N = targets.length;

        // 当前状态：左侧偏中
        const curPos: Pos = { x: N > 0 ? -availW * 0.26 : 0, y: 0 };

        // 下一状态：右侧竖向列表，行高自适应，保证节点不重叠
        const outgoing: Array<{ state: string; pos: Pos; transition: OutgoingTransition; isGlobal: boolean }> = [];
        if (N > 0) {
            const rightX = availW * 0.18;
            const rowH = Math.min(56, (availH * 0.85) / N);
            const startY = rowH * (N - 1) / 2;
            for (let i = 0; i < N; i++) {
                outgoing.push({
                    state: targets[i],
                    pos: { x: rightX, y: startY - i * rowH },
                    transition: bestMap[targets[i]],
                    isGlobal: isGlobalMap[targets[i]],
                });
            }
        }

        // 上一状态：左上角固定位置
        let prevPos: Pos = null;
        if (this._prevState && this._prevState !== this._currentState) {
            prevPos = {
                x: -availW / 2 + this._prevRadius + PADDING * 0.5,
                y:  availH / 2 - this._prevRadius - PADDING * 3.5,
            };
        }

        return { curPos, prevPos, outgoing };
    }

    // ── 辅助绘制 ──────────────────────────────────────────────

    private _drawStateNode(
        g: cc.Graphics,
        x: number, y: number, r: number,
        fillColor: cc.Color, strokeColor: cc.Color,
        glow: boolean
    ) {
        if (glow) {
            // 光晕
            g.fillColor = cc.color(
                strokeColor.r, strokeColor.g, strokeColor.b, 40
            );
            g.circle(x, y, r * 1.6);
            g.fill();
        }
        g.fillColor = fillColor;
        g.circle(x, y, r);
        g.fill();
        g.strokeColor = strokeColor;
        g.lineWidth = glow ? 2.5 : 1.5;
        g.circle(x, y, r);
        g.stroke();
    }

    private _drawArrow(
        g: cc.Graphics,
        fx: number, fy: number,
        tx: number, ty: number,
        rFrom: number, rTo: number,
        col: cc.Color,
        dashed: boolean
    ) {
        const dx = tx - fx;
        const dy = ty - fy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) return;

        const nx = dx / dist;
        const ny = dy / dist;
        const sx = fx + nx * rFrom;
        const sy = fy + ny * rFrom;
        const ex = tx - nx * rTo;
        const ey = ty - ny * rTo;

        g.strokeColor = col;
        g.lineWidth = 1.5;

        if (dashed) {
            const seg = 7, gap = 5;
            const ldx = ex - sx, ldy = ey - sy;
            const total = Math.sqrt(ldx * ldx + ldy * ldy);
            if (total > 0) {
                let traveled = 0, drawing = true;
                g.moveTo(sx, sy);
                while (traveled < total) {
                    const step = Math.min(drawing ? seg : gap, total - traveled);
                    if (step <= 0) break;
                    traveled += step;
                    const r = traveled / total;
                    const px = sx + ldx * r, py = sy + ldy * r;
                    if (drawing) g.lineTo(px, py); else g.moveTo(px, py);
                    drawing = !drawing;
                }
                g.stroke();
            }
        } else {
            g.moveTo(sx, sy);
            g.lineTo(ex, ey);
            g.stroke();
        }

        // 箭头头
        const L = Math.max(7, rTo * 0.35);
        const angle = Math.atan2(ny, nx);
        g.moveTo(ex, ey);
        g.lineTo(ex + Math.cos(angle + Math.PI * 0.75) * L, ey + Math.sin(angle + Math.PI * 0.75) * L);
        g.moveTo(ex, ey);
        g.lineTo(ex + Math.cos(angle - Math.PI * 0.75) * L, ey + Math.sin(angle - Math.PI * 0.75) * L);
        g.stroke();
    }

    private _conditionLabel(t: OutgoingTransition, isGlobal: boolean): string {
        const prefix = isGlobal ? "[*]" : "";
        if (t.conditionType === ConditionType.OnInput)        return prefix + (t.inputAction || "Input");
        if (t.conditionType === ConditionType.OnAnimFinish)   return prefix + "Finish";
        if (t.conditionType === ConditionType.Immediate)      return prefix + "Auto";
        if (t.conditionType === ConditionType.OnInputRelease) return prefix + "↑" + (t.inputAction || "");
        if (t.conditionType === ConditionType.OnDoubleTap)    return prefix + "×2" + (t.inputAction || "");
        if (t.conditionType === ConditionType.OnCombo)        return prefix + (t.comboModifiers || "") + "+" + (t.inputAction || "");
        if (t.conditionType === ConditionType.OnInputHeld)   return prefix + "[H]" + (t.inputAction || "");
        return prefix;
    }

    private _addLabel(
        x: number, y: number, text: string, fontSize: number, color: cc.Color,
        halign: cc.Label.HorizontalAlign = cc.Label.HorizontalAlign.CENTER
    ) {
        const n = new cc.Node();
        const l = n.addComponent(cc.Label);
        l.string = text;
        l.fontSize = fontSize;
        l.horizontalAlign = halign;
        l.verticalAlign   = cc.Label.VerticalAlign.CENTER;
        n.color = color;
        n.setPosition(x, y);
        this.node.addChild(n);
        this._labelNodes.push(n);
    }
}
