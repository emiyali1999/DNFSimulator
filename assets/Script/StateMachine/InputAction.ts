/**
 * 游戏输入动作定义
 * 将具体按键映射为抽象输入动作，供状态机使用
 */
export enum InputAction {
    MoveLeft  = "MoveLeft",
    MoveRight = "MoveRight",
    MoveUp    = "MoveUp",
    MoveDown  = "MoveDown",
    Attack1   = "Attack1",   // X 键
    Attack2   = "Attack2",   // Z 键
    Attack3   = "Attack3",   // C 键
    Jump      = "Jump",      // Space
    Defend    = "Defend",    // V 键
}

/** keyCode → InputAction 映射表，调用 initKeyMap() 后可用 */
export const KEY_ACTION_MAP: { [keyCode: number]: InputAction } = {};

/** 在 cc 环境就绪后调用一次，初始化按键映射 */
export function initKeyMap() {
    KEY_ACTION_MAP[cc.macro.KEY.a]     = InputAction.MoveLeft;
    KEY_ACTION_MAP[cc.macro.KEY.left]  = InputAction.MoveLeft;
    KEY_ACTION_MAP[cc.macro.KEY.d]     = InputAction.MoveRight;
    KEY_ACTION_MAP[cc.macro.KEY.right] = InputAction.MoveRight;
    KEY_ACTION_MAP[cc.macro.KEY.w]     = InputAction.MoveUp;
    KEY_ACTION_MAP[cc.macro.KEY.up]    = InputAction.MoveUp;
    KEY_ACTION_MAP[cc.macro.KEY.s]     = InputAction.MoveDown;
    KEY_ACTION_MAP[cc.macro.KEY.down]  = InputAction.MoveDown;
    KEY_ACTION_MAP[cc.macro.KEY.x]     = InputAction.Attack1;
    KEY_ACTION_MAP[cc.macro.KEY.z]     = InputAction.Attack2;
    KEY_ACTION_MAP[cc.macro.KEY.c]     = InputAction.Attack3;
    KEY_ACTION_MAP[cc.macro.KEY.space] = InputAction.Jump;
    KEY_ACTION_MAP[cc.macro.KEY.v]     = InputAction.Defend;
}
