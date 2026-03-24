/**
 * 按键名映射表
 * keyCode → 键名字符串，状态机 transition 的 inputAction 直接填键名即可
 * 例如：X 键 → "X"，空格 → "Space"，方向左 → "Left"
 */
export const KEY_ACTION_MAP: { [keyCode: number]: string } = {};

/** 在 cc 环境就绪后调用一次，初始化按键映射 */
export function initKeyMap() {
    KEY_ACTION_MAP[cc.macro.KEY.left]  = "Left";
    KEY_ACTION_MAP[cc.macro.KEY.right] = "Right";
    KEY_ACTION_MAP[cc.macro.KEY.up]    = "Up";
    KEY_ACTION_MAP[cc.macro.KEY.down]  = "Down";
    KEY_ACTION_MAP[cc.macro.KEY.x]     = "X";
    KEY_ACTION_MAP[cc.macro.KEY.z]     = "Z";
    KEY_ACTION_MAP[cc.macro.KEY.c]     = "C";
    KEY_ACTION_MAP[cc.macro.KEY.v]     = "V";
    KEY_ACTION_MAP[cc.macro.KEY.space] = "Space";
}
