/**
 * 状态机可视化组件（运行时）
 * 使用 cc.Graphics 绘制状态节点圆圈和转换箭头
 *
 * 使用方法：
 *   1. 在 Canvas 下创建空节点，挂载此组件
 *   2. 将 targetStateMachine 指向角色的 StateMachineComponent
 *   3. 运行游戏即可看到实时状态图
 */

import StateMachineComponent from "./StateMachineComponent";
import StateMachineConfig from "./StateMachineConfig";
import { ConditionType } from "./StateMachineConfig";

const { ccclass, property } = cc._decorator;

const NODE_RADIUS = 36;

@ccclass
export default class StateMachineVisualizer extends cc.Component {

    @property(StateMachineComponent)
    targetStateMachine: StateMachineComponent = null;

    @property
    offsetX: number = 0;

    @property
    offsetY: number = 0;

    private _graphics: cc.Graphics = null;
    private _labelNodes: { [name: string]: cc.Node } = {};
    private _tempNodes: cc.Node[] = [];
    private _lastState: string = "";

    onLoad() {
        // 给节点一个足够大的尺寸，避免被裁剪
        this.node.setContentSize(960, 640);

        this._graphics = this.node.addComponent(cc.Graphics);

        if (!this.targetStateMachine) {
            cc.warn("[Viz] targetStateMachine 未赋值");
            return;
        }

        this.targetStateMachine.node.on("state-changed", this._onStateChanged, this);

        // 每 0.2 秒轮询，等待状态机加载完毕
        this.schedule(this._tryInit, 0.2);
    }

    onDestroy() {
        if (this.targetStateMachine) {
            this.targetStateMachine.node.off("state-changed", this._onStateChanged, this);
        }
    }

    private _tryInit() {
        if (!this.targetStateMachine.isLoaded()) {
            cc.log("[Viz] 等待状态机加载...");
            return;
        }

        this.unschedule(this._tryInit);

        const config = this.targetStateMachine.getConfig();
        cc.log(`[Viz] 初始化，状态数: ${config ? config.states.length : 0}`);

        if (!config || config.states.length === 0) {
            cc.warn("[Viz] StateMachineConfig.states 为空，请在 Inspector 中填写 States 数组");
            return;
        }

        this._buildLabels(config);
        this._redraw();
    }

    private _onStateChanged(data: { from: string; to: string }) {
        cc.log(`[Viz] 状态变化: ${data.from} → ${data.to}`);
        this._lastState = data.to;
        this._redraw();
    }

    private _buildLabels(config: StateMachineConfig) {
        // 清理旧标签
        for (const key in this._labelNodes) {
            this._labelNodes[key].destroy();
        }
        this._labelNodes = {};

        for (const s of config.states) {
            const n = new cc.Node(`VizLabel_${s.stateName}`);
            const lbl = n.addComponent(cc.Label);
            lbl.string = s.stateName;
            lbl.fontSize = 13;
            lbl.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
            lbl.verticalAlign = cc.Label.VerticalAlign.CENTER;
            n.color = cc.color(220, 220, 255, 255);
            n.setPosition(s.graphX + this.offsetX, s.graphY + this.offsetY);
            this.node.addChild(n);
            this._labelNodes[s.stateName] = n;
            cc.log(`[Viz] 创建标签: ${s.stateName} @ (${s.graphX + this.offsetX}, ${s.graphY + this.offsetY})`);
        }
    }

    private _redraw() {
        const config = this.targetStateMachine ? this.targetStateMachine.getConfig() : null;
        if (!config || !this._graphics) return;

        // 清理上一帧的临时文字节点
        for (const n of this._tempNodes) { n.destroy(); }
        this._tempNodes = [];

        const g = this._graphics;
        g.clear();

        const currentState = this.targetStateMachine.getCurrentState();

        // 构建坐标表
        const pos: { [name: string]: { x: number; y: number } } = {};
        for (const s of config.states) {
            pos[s.stateName] = { x: s.graphX + this.offsetX, y: s.graphY + this.offsetY };
        }

        // ① 箭头
        for (const t of config.transitions) {
            const fromName = t.fromState === "*" ? config.defaultState : t.fromState;
            const fp = pos[fromName];
            const tp = pos[t.toState];
            if (!fp || !tp) continue;

            const isActive = (t.fromState === currentState || t.fromState === "*");
            const col = isActive ? cc.color(255, 240, 100, 220) : cc.color(160, 160, 160, 160);
            this._arrow(g, fp.x, fp.y, tp.x, tp.y, col);

            // 转换条件文字
            if (t.inputAction) {
                this._addTempLabel(
                    (fp.x + tp.x) / 2,
                    (fp.y + tp.y) / 2 + 12,
                    t.inputAction,
                    isActive ? cc.color(255, 255, 100, 255) : cc.color(180, 180, 180, 200)
                );
            }
        }

        // ② 状态圆圈
        for (const s of config.states) {
            const p = pos[s.stateName];
            if (!p) continue;
            const isActive = s.stateName === currentState;

            g.fillColor = isActive ? cc.color(230, 160, 20, 255) : cc.color(50, 60, 100, 210);
            g.circle(p.x, p.y, NODE_RADIUS);
            g.fill();

            g.strokeColor = isActive ? cc.color(255, 220, 80, 255) : cc.color(150, 160, 220, 220);
            g.lineWidth = isActive ? 3 : 1.5;
            g.circle(p.x, p.y, NODE_RADIUS);
            g.stroke();

            // 更新标签颜色
            if (this._labelNodes[s.stateName]) {
                this._labelNodes[s.stateName].color = isActive
                    ? cc.color(255, 255, 100, 255)
                    : cc.color(220, 220, 255, 255);
            }
        }

        cc.log(`[Viz] 绘制完成，当前状态: ${currentState}，节点数: ${config.states.length}`);
    }

    private _arrow(g: cc.Graphics, fx: number, fy: number, tx: number, ty: number, col: cc.Color) {
        const dx = tx - fx;
        const dy = ty - fy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) return;

        const nx = dx / dist;
        const ny = dy / dist;

        const sx = fx + nx * NODE_RADIUS;
        const sy = fy + ny * NODE_RADIUS;
        const ex = tx - nx * NODE_RADIUS;
        const ey = ty - ny * NODE_RADIUS;

        g.strokeColor = col;
        g.lineWidth = 1.5;
        g.moveTo(sx, sy);
        g.lineTo(ex, ey);
        g.stroke();

        const angle = Math.atan2(ny, nx);
        const L = 10;
        g.moveTo(ex, ey);
        g.lineTo(ex + Math.cos(angle + Math.PI * 0.75) * L, ey + Math.sin(angle + Math.PI * 0.75) * L);
        g.moveTo(ex, ey);
        g.lineTo(ex + Math.cos(angle - Math.PI * 0.75) * L, ey + Math.sin(angle - Math.PI * 0.75) * L);
        g.stroke();
    }

    private _addTempLabel(x: number, y: number, text: string, color: cc.Color) {
        const n = new cc.Node();
        const l = n.addComponent(cc.Label);
        l.string = text;
        l.fontSize = 11;
        l.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
        n.color = color;
        n.setPosition(x, y);
        this.node.addChild(n);
        this._tempNodes.push(n);
    }
}
