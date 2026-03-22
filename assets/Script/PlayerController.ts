/**
 * 玩家控制器
 * 负责移动逻辑，并将按键输入通过 StateMachineComponent.triggerInput() 传递给状态机
 * 状态机本身已监听全局键盘事件，此处仅保留移动逻辑
 */

import StateMachineComponent from "./StateMachine/StateMachineComponent";

const { ccclass, property } = cc._decorator;

@ccclass
export default class PlayerController extends cc.Component {

    /** 移动速度（像素/秒） */
    @property
    moveSpeed: number = 300;

    /** 挂在同一节点上的状态机组件（可留空，状态机会自行监听键盘） */
    @property(StateMachineComponent)
    stateMachine: StateMachineComponent = null;

    private _moveDir: cc.Vec2 = cc.v2(0, 0);

    onLoad() {
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_UP,   this.onKeyUp,   this);
    }

    onDestroy() {
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_UP,   this.onKeyUp,   this);
    }

    onKeyDown(event: cc.Event.EventKeyboard) {
        switch (event.keyCode) {
            case cc.macro.KEY.up:
            case cc.macro.KEY.w:    this._moveDir.y =  1; break;
            case cc.macro.KEY.down:
            case cc.macro.KEY.s:    this._moveDir.y = -1; break;
            case cc.macro.KEY.left:
            case cc.macro.KEY.a:    this._moveDir.x = -1; break;
            case cc.macro.KEY.right:
            case cc.macro.KEY.d:    this._moveDir.x =  1; break;
        }
        // 注意：攻击/跳跃等输入由 StateMachineComponent 内置键盘监听直接处理，
        // 无需在此重复触发。如需外部触发可调用：
        //   this.stateMachine.triggerInput(InputAction.Attack1);
    }

    onKeyUp(event: cc.Event.EventKeyboard) {
        switch (event.keyCode) {
            case cc.macro.KEY.up:
            case cc.macro.KEY.w:    if (this._moveDir.y >  0) this._moveDir.y = 0; break;
            case cc.macro.KEY.down:
            case cc.macro.KEY.s:    if (this._moveDir.y <  0) this._moveDir.y = 0; break;
            case cc.macro.KEY.left:
            case cc.macro.KEY.a:    if (this._moveDir.x < 0)  this._moveDir.x = 0; break;
            case cc.macro.KEY.right:
            case cc.macro.KEY.d:    if (this._moveDir.x >  0) this._moveDir.x = 0; break;
        }
    }

    update(dt: number) {
        if (this._moveDir.x === 0 && this._moveDir.y === 0) return;

        const pos = this.node.position;
        this.node.setPosition(
            pos.x + this._moveDir.x * this.moveSpeed * dt,
            pos.y + this._moveDir.y * this.moveSpeed * dt
        );
    }
}
