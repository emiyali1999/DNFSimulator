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
    /** 基础移动速度（世界单位/秒），各状态的实际速度 = moveSpeed × 状态的 horizMoveScale/vertMoveScale */
    @property
    moveSpeed: number = 300;

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
    /** 水平发射速度（由 launchHorizSpeed 驱动，不依赖方向键） */
    private _velX: number = 0;
    private _isOnGround: boolean = true;

    get worldY(): number { return this._worldY; }
    get worldZ(): number { return this._worldZ; }

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
        this._updateLaunchVelocity(dt);
        this._updateJump(dt);
        this._applyProjection();
    }

    // ── 私有方法 ─────────────────────────────────────────────

    private _updateMovement(dt: number) {
        if (this._moveDir.x === 0 && this._moveDir.y === 0) return;
        if (!this.stateMachine) return;

        const stateName = this.stateMachine.getCurrentState();
        const animState = this.stateMachine.getAnimState(stateName);
        const horizScale = animState ? animState.horizMoveScale : 0;
        const vertScale  = animState ? animState.vertMoveScale  : 0;
        if (horizScale === 0 && vertScale === 0) return;

        // 帧限制检查：moveFrames 非空时，只有列出的帧可以移动
        if (animState && animState.moveFrames.length > 0) {
            const frame = this.stateMachine.animPlayer.currentFrameIndex;
            if (animState.moveFrames.indexOf(frame) === -1) return;
        }

        const speed = this.moveSpeed * this.speedScale;

        if (this._moveDir.x !== 0 && horizScale !== 0) {
            // 若状态限制只能往面朝方向移动，则检查输入方向与 scaleX 是否一致
            const onlyFacing = animState ? animState.onlyFacingDir : true;
            const scaleX     = this.stateMachine ? this.stateMachine.node.scaleX : this.node.scaleX;
            const facingDir  = scaleX >= 0 ? 1 : -1;
            if (!onlyFacing || this._moveDir.x === facingDir) {
                this._worldX += this._moveDir.x * speed * horizScale * dt;
            }
        }
        if (this._moveDir.y !== 0 && vertScale !== 0) {
            this._worldZ += this._moveDir.y * speed * vertScale * dt;
        }
    }

    /** 应用水平发射速度（后跳等技能的自动位移，不依赖方向键） */
    private _updateLaunchVelocity(dt: number) {
        if (this._velX === 0) return;
        this._worldX += this._velX * dt;
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
                this.stateMachine.forceChangeState("SwordMan_StandBattle");
                // 落地后同帧补发仍按住的方向键，让状态机立刻切换到 Walk
                const k = cc.macro.KEY;
                if (this._heldKeys.has(k.left))  this.stateMachine.triggerInputImmediate('Left');
                if (this._heldKeys.has(k.right)) this.stateMachine.triggerInputImmediate('Right');
                if (this._heldKeys.has(k.up))    this.stateMachine.triggerInputImmediate('Up');
                if (this._heldKeys.has(k.down))  this.stateMachine.triggerInputImmediate('Down');
            }
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
        const animState = this.stateMachine ? this.stateMachine.getAnimState(data.to) : null;

        // 水平发射速度（后跳等）：每次状态切换都更新，新状态无 launchHorizSpeed 则清零
        const launchSpeed = animState ? animState.launchHorizSpeed : 0;
        const scaleX = this.stateMachine ? this.stateMachine.node.scaleX : 1;
        const facingDir = scaleX >= 0 ? 1 : -1;
        this._velX = launchSpeed * facingDir;

        // 跳跃
        if (data.to.indexOf("Jump") !== -1 && this._isOnGround) {
            const jumpSpeed = animState ? animState.jumpSpeed : 0;
            if (jumpSpeed <= 0) return;

            this._velY         = jumpSpeed;
            this._isOnGround   = false;
            this._syncJumpAnimFps(animState, jumpSpeed);
        }
    }

    /**
     * 根据跳跃物理时长动态调整 Jump 动画的 fps，使动画最后一帧恰好在落地时播完
     * jumpDuration = 2 × jumpSpeed / gravity（上升 + 下降对称）
     */
    private _syncJumpAnimFps(animState: import("../SpriteAnimState").default, jumpSpeed: number) {
        if (!this.stateMachine || !this.stateMachine.animPlayer) return;
        if (!animState || animState.frameCount <= 0) return;
        const duration = 2 * jumpSpeed / this.gravity;
        this.stateMachine.animPlayer.setFpsOverride(animState.frameCount / duration);
    }

    private _onKeyDown(event: cc.Event.EventKeyboard) {
        this._heldKeys.add(event.keyCode);
        const k = cc.macro.KEY;
        switch (event.keyCode) {
            case k.up:    this._moveDir.y =  1; break;
            case k.down:  this._moveDir.y = -1; break;
            case k.left:  this._moveDir.x = -1; break;
            case k.right: this._moveDir.x =  1; break;
        }
    }

    private _onKeyUp(event: cc.Event.EventKeyboard) {
        this._heldKeys.delete(event.keyCode);
        const k = cc.macro.KEY;
        switch (event.keyCode) {
            case k.up:
                if (this._moveDir.y > 0)
                    this._moveDir.y = this._heldKeys.has(k.down) ? -1 : 0;
                break;
            case k.down:
                if (this._moveDir.y < 0)
                    this._moveDir.y = this._heldKeys.has(k.up) ? 1 : 0;
                break;
            case k.left:
                if (this._moveDir.x < 0)
                    this._moveDir.x = this._heldKeys.has(k.right) ? 1 : 0;
                break;
            case k.right:
                if (this._moveDir.x > 0)
                    this._moveDir.x = this._heldKeys.has(k.left) ? -1 : 0;
                break;
        }
    }

}
