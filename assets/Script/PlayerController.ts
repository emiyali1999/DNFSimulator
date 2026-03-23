/**
 * 玩家控制器
 *
 * 世界坐标系（3D）：
 *   worldX — 水平轴，与屏幕 X 1:1 对应
 *   worldY — 高度轴，Jump 时变化，受重力影响
 *   worldZ — 深度轴，上下键控制，正方向为屏幕上方（远处）
 *
 * 投影到屏幕（斜投影）：
 *   screenX = worldX
 *   screenY = worldY + worldZ × perspectiveRatio
 *
 * perspectiveRatio 控制深度轴的视觉压缩比，0.5 时 Z 轴移动在屏幕上
 * 只呈现一半的高度变化，产生俯视感。
 */

import StateMachineComponent from "./StateMachine/StateMachineComponent";

const { ccclass, property } = cc._decorator;

@ccclass
export default class PlayerController extends cc.Component {

    // ── 移动属性 ─────────────────────────────────────────────
    /** 行走速度（世界单位/秒） */
    @property
    walkSpeed: number = 100;

    /** 奔跑速度（世界单位/秒） */
    @property
    runSpeed: number = 200;

    /** 速度缩放系数，乘在最终速度上 */
    @property
    speedScale: number = 1;

    // ── 投影属性 ─────────────────────────────────────────────
    /**
     * 深度轴投影比例
     * screenY 中 worldZ 的贡献 = worldZ × perspectiveRatio
     * 典型值：0.5（俯视 DNF 风格）
     */
    @property
    perspectiveRatio: number = 0.5;

    // ── 跳跃属性 ─────────────────────────────────────────────
    /** 跳跃初速度（世界单位/秒） */
    @property
    jumpSpeed: number = 600;

    /** 重力加速度（世界单位/秒²） */
    @property
    gravity: number = 1200;

    // ── 引用 ─────────────────────────────────────────────────
    @property(StateMachineComponent)
    stateMachine: StateMachineComponent = null;

    // ── 内部状态 ─────────────────────────────────────────────
    /** 世界坐标 */
    private _worldX: number = 0;
    private _worldY: number = 0;   // 高度（地面 = 0）
    private _worldZ: number = 0;   // 深度

    /** 跳跃竖向速度 */
    private _velY: number = 0;
    private _isOnGround: boolean = true;
    /** 跳跃前的状态名，落地时若有方向键按住则恢复此状态 */
    private _preJumpState: string = "";

    /** 方向输入：x = 左右，y = 深度（上下键） */
    private _moveDir: cc.Vec2 = cc.v2(0, 0);
    private _heldKeys: Set<number> = new Set();

    // ── 生命周期 ─────────────────────────────────────────────
    onLoad() {
        // 用节点当前屏幕位置初始化世界坐标
        // screenY = worldY(0) + worldZ × ratio  →  worldZ = screenY / ratio
        this._worldX = this.node.x;
        this._worldY = 0;
        this._worldZ = this.perspectiveRatio > 0
            ? this.node.y / this.perspectiveRatio
            : 0;

        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, this._onKeyDown, this);
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_UP,   this._onKeyUp,   this);

        // 监听状态机状态变化，在进入 Jump 状态时触发跳跃
        this.node.on("state-changed", this._onStateChanged, this);
    }

    onDestroy() {
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_DOWN, this._onKeyDown, this);
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_UP,   this._onKeyUp,   this);
        this.node.off("state-changed", this._onStateChanged, this);
    }

    update(dt: number) {
        this._updateMovement(dt);
        this._updateJump(dt);
        this._applyProjection();
    }

    // ── 私有方法 ─────────────────────────────────────────────

    private _updateMovement(dt: number) {
        if (this._moveDir.x === 0 && this._moveDir.y === 0) return;

        const state = this.stateMachine ? this.stateMachine.getCurrentState() : "";
        const baseSpeed = state.indexOf("Run") !== -1 ? this.runSpeed : this.walkSpeed;
        const speed = baseSpeed * this.speedScale;

        this._worldX += this._moveDir.x * speed * dt;
        this._worldZ += this._moveDir.y * speed * dt;   // 上下键 → 深度轴
    }

    private _updateJump(dt: number) {
        if (this._isOnGround) return;

        this._velY   -= this.gravity * dt;
        this._worldY += this._velY * dt;

        if (this._worldY <= 0) {
            this._worldY     = 0;
            this._velY       = 0;
            this._isOnGround = true;
            // 落地时：若跳前是 Walk/Run 且仍有方向键按住，恢复原状态；否则回 StandBattle
            if (this.stateMachine) {
                const k = cc.macro.KEY;
                const hasDir = this._heldKeys.has(k.left)  || this._heldKeys.has(k.a) ||
                               this._heldKeys.has(k.right) || this._heldKeys.has(k.d) ||
                               this._heldKeys.has(k.up)    || this._heldKeys.has(k.w) ||
                               this._heldKeys.has(k.down)  || this._heldKeys.has(k.s);
                const landing = (this._preJumpState && hasDir)
                    ? this._preJumpState
                    : "SwordMan_StandBattle";
                this.stateMachine.forceChangeState(landing);
            }
            this._preJumpState = "";
        }
    }

    /**
     * 斜投影：将世界坐标映射到屏幕坐标
     *   screenX = worldX
     *   screenY = worldY + worldZ × perspectiveRatio
     * zIndex 用深度排序，worldZ 越小（越靠近镜头）越在前面
     */
    private _applyProjection() {
        this.node.x      = this._worldX;
        this.node.y      = this._worldY + this._worldZ * this.perspectiveRatio;
        // 用大正数作基准，worldZ 越大（越远）zIndex 越小（越靠后）
        // 保证玩家始终在 background（zIndex=0）之上
        this.node.zIndex = 1000 - Math.round(this._worldZ);
    }

    private _onStateChanged(data: { from: string; to: string }) {
        if (data.to.indexOf("Jump") !== -1 && this._isOnGround) {
            // 只记录 Walk/Run 状态，其他状态跳跃落地后回 StandBattle
            this._preJumpState = (data.from.indexOf("Walk") !== -1 || data.from.indexOf("Run") !== -1)
                ? data.from : "";
            this._velY         = this.jumpSpeed;
            this._isOnGround   = false;
            this._syncJumpAnimFps(data.to);
        }
    }

    /**
     * 根据跳跃物理时长动态调整 Jump 动画的 fps，使动画最后一帧恰好在落地时播完
     * jumpDuration = 2 × jumpSpeed / gravity（上升 + 下降对称）
     */
    private _syncJumpAnimFps(jumpStateName: string) {
        if (!this.stateMachine || !this.stateMachine.animPlayer) return;
        const animState = this.stateMachine.getAnimState(jumpStateName);
        if (!animState || animState.frameCount <= 0) return;
        const duration = 2 * this.jumpSpeed / this.gravity;
        this.stateMachine.animPlayer.setFpsOverride(animState.frameCount / duration);
    }

    private _onKeyDown(event: cc.Event.EventKeyboard) {
        this._heldKeys.add(event.keyCode);
        const k = cc.macro.KEY;
        switch (event.keyCode) {
            case k.up:
            case k.w:     this._moveDir.y =  1; break;
            case k.down:
            case k.s:     this._moveDir.y = -1; break;
            case k.left:
            case k.a:     this._moveDir.x = -1; break;
            case k.right:
            case k.d:     this._moveDir.x =  1; break;
        }
    }

    private _onKeyUp(event: cc.Event.EventKeyboard) {
        this._heldKeys.delete(event.keyCode);
        const k = cc.macro.KEY;
        switch (event.keyCode) {
            case k.up:
            case k.w:
                if (this._moveDir.y > 0)
                    this._moveDir.y = (this._heldKeys.has(k.down) || this._heldKeys.has(k.s)) ? -1 : 0;
                break;
            case k.down:
            case k.s:
                if (this._moveDir.y < 0)
                    this._moveDir.y = (this._heldKeys.has(k.up) || this._heldKeys.has(k.w)) ? 1 : 0;
                break;
            case k.left:
            case k.a:
                if (this._moveDir.x < 0)
                    this._moveDir.x = (this._heldKeys.has(k.right) || this._heldKeys.has(k.d)) ? 1 : 0;
                break;
            case k.right:
            case k.d:
                if (this._moveDir.x > 0)
                    this._moveDir.x = (this._heldKeys.has(k.left) || this._heldKeys.has(k.a)) ? -1 : 0;
                break;
        }
    }

    // ── 公共接口 ─────────────────────────────────────────────

    /** 获取当前世界坐标 */
    getWorldPos(): { x: number; y: number; z: number } {
        return { x: this._worldX, y: this._worldY, z: this._worldZ };
    }

    /** 是否在地面上 */
    isOnGround(): boolean {
        return this._isOnGround;
    }
}
