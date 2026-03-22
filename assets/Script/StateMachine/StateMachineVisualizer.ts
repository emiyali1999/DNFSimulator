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

const { ccclass, property } = cc._decorator;

const PADDING = 14;

interface Pos { x: number; y: number; }

@ccclass
export default class StateMachineVisualizer extends cc.Component {

    @property(StateMachineComponent)
    targetStateMachine: StateMachineComponent = null;

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

    onLoad() {
        this._graphics = this.node.addComponent(cc.Graphics);

        if (!this.targetStateMachine) {
            cc.warn("[Viz] targetStateMachine 未赋值");
            return;
        }

        this.targetStateMachine.node.on("state-changed", this._onStateChanged, this);
        this.schedule(this._tryInit, 0.2);
    }

    onDestroy() {
        if (this.targetStateMachine) {
            this.targetStateMachine.node.off("state-changed", this._onStateChanged, this);
        }
    }

    // ── 初始化 ────────────────────────────────────────────────

    private _tryInit() {
        if (!this.targetStateMachine || !this.targetStateMachine.isLoaded()) return;
        this.unschedule(this._tryInit);
        this._setupArea();
        this._currentState = this.targetStateMachine.getCurrentState();
        this._fullRedraw();
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

        // 背景面板
        g.fillColor = cc.color(8, 10, 20, 190);
        g.roundRect(-aW / 2, -aH / 2, aW, aH, 10);
        g.fill();
        g.strokeColor = cc.color(80, 90, 140, 180);
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

            // 条件标签（显示在箭头中点）
            const label = this._conditionLabel(item.transition, item.isGlobal);
            if (label) {
                this._addLabel(
                    (fp.x + tp.x) / 2 + 4,
                    (fp.y + tp.y) / 2 + 6,
                    label,
                    Math.max(8, Math.round(this._nextRadius * 0.48)),
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
            this._addLabel(
                item.pos.x, item.pos.y,
                item.state,
                Math.max(8, Math.round(this._nextRadius * 0.52)),
                isHot ? cc.color(180, 255, 120, 255) : cc.color(200, 210, 255, 230)
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

    // ── 布局计算 ──────────────────────────────────────────────

    private _findStateCfg(config: StateMachineConfig, stateName: string): StateNodeConfig | null {
        for (let i = 0; i < config.states.length; i++) {
            if (config.states[i].stateName === stateName) return config.states[i];
        }
        return null;
    }

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

        const stateCfg = this._findStateCfg(config, this._currentState);
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

        // 当前状态放在区域中心偏左（为右侧扇形留空间）
        const N = targets.length;
        let curX = 0;
        let curY = 0;

        if (N > 0) {
            // 当前状态偏左，留出右侧扇形空间
            curX = -availW * 0.22;
        }
        const curPos: Pos = { x: curX, y: curY };

        // 辐射半径：以当前节点为圆心，向右半平面展开
        const radialR = Math.min(availW * 0.38, availH * 0.38);

        // N 个目标：在右半圆 [-75°, +75°] 扇形内均匀分布
        // 若 N == 1，直接放右侧
        const outgoing: Array<{ state: string; pos: Pos; transition: TransitionConfig }> = [];

        if (N === 1) {
            outgoing.push({
                state: targets[0],
                pos:   { x: curX + radialR, y: curY },
                transition: bestMap[targets[0]],
                isGlobal: isGlobalMap[targets[0]],
            });
        } else if (N > 1) {
            const halfSpan = Math.min(Math.PI * 0.75, Math.PI * (N - 1) / N);
            for (let i = 0; i < N; i++) {
                const angle = -halfSpan + (2 * halfSpan / (N - 1)) * i;
                outgoing.push({
                    state: targets[i],
                    pos: {
                        x: curX + radialR * Math.cos(angle),
                        y: curY + radialR * Math.sin(angle),
                    },
                    transition: bestMap[targets[i]],
                    isGlobal: isGlobalMap[targets[i]],
                });
            }
        }

        // 上一状态：左上角固定位置（如果不是 currentState 且有记录）
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
        if (t.conditionType === ConditionType.OnInput)       return prefix + (t.inputAction || "Input");
        if (t.conditionType === ConditionType.OnAnimFinish)  return prefix + "Finish";
        if (t.conditionType === ConditionType.Immediate)     return prefix + "Auto";
        return prefix;
    }

    private _addLabel(x: number, y: number, text: string, fontSize: number, color: cc.Color) {
        const n = new cc.Node();
        const l = n.addComponent(cc.Label);
        l.string = text;
        l.fontSize = fontSize;
        l.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
        l.verticalAlign   = cc.Label.VerticalAlign.CENTER;
        n.color = color;
        n.setPosition(x, y);
        this.node.addChild(n);
        this._labelNodes.push(n);
    }
}
