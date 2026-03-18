import UnitStateMachine from "./UnitStateMachine";

const {ccclass, property} = cc._decorator;

@ccclass
export default class PlayerController extends cc.Component {

    /** 移动速度（像素/秒） */
    @property
    moveSpeed: number = 300;

    @property(UnitStateMachine)
    stateMachine: UnitStateMachine = null;

    private _moveDir: cc.Vec2 = cc.v2(0, 0);

    onLoad () {
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_UP, this.onKeyUp, this);
    }

    onDestroy () {
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_UP, this.onKeyUp, this);
    }

    onKeyDown (event: cc.Event.EventKeyboard) {
        switch (event.keyCode) {
            case cc.macro.KEY.up:
            case cc.macro.KEY.w:
                this._moveDir.y = 1;
                break;
            case cc.macro.KEY.down:
            case cc.macro.KEY.s:
                this._moveDir.y = -1;
                break;
            case cc.macro.KEY.left:
            case cc.macro.KEY.a:
                this._moveDir.x = -1;
                break;
            case cc.macro.KEY.right:
            case cc.macro.KEY.d:
                this._moveDir.x = 1;
                break;
            case cc.macro.KEY.x:
                if (this.stateMachine) {
                    this.stateMachine.changeState("SwordMan_Attack01");
                }
                break;
        }
    }

    onKeyUp (event: cc.Event.EventKeyboard) {
        switch (event.keyCode) {
            case cc.macro.KEY.up:
            case cc.macro.KEY.w:
                if (this._moveDir.y > 0) this._moveDir.y = 0;
                break;
            case cc.macro.KEY.down:
            case cc.macro.KEY.s:
                if (this._moveDir.y < 0) this._moveDir.y = 0;
                break;
            case cc.macro.KEY.left:
            case cc.macro.KEY.a:
                if (this._moveDir.x < 0) this._moveDir.x = 0;
                break;
            case cc.macro.KEY.right:
            case cc.macro.KEY.d:
                if (this._moveDir.x > 0) this._moveDir.x = 0;
                break;
        }
    }

    update (dt: number) {
        if (this._moveDir.x === 0 && this._moveDir.y === 0) return;

        const pos = this.node.position;
        this.node.setPosition(
            pos.x + this._moveDir.x * this.moveSpeed * dt,
            pos.y + this._moveDir.y * this.moveSpeed * dt
        );
    }
}
