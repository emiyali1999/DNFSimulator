/**
 * 状态机运行时组件
 * 挂在 Unit 节点上，负责：
 *   - 加载 StateMachineConfig 和所有动画状态
 *   - 监听键盘输入和动画结束事件
 *   - 根据 TransitionConfig 规则执行状态转换
 *   - 驱动 SpriteAnimPlayer 播放对应动画
 */

import StateMachineConfig, { ConditionType, CompareOp, OutgoingTransition, StateNodeConfig } from "./StateMachineConfig";
import SpriteAnimPlayer from "../SpriteAnimPlayer";
import SpriteAnimState from "../SpriteAnimState";
import { initKeyMap, KEY_ACTION_MAP } from "./InputAction";

const { ccclass, property } = cc._decorator;

@ccclass
export default class StateMachineComponent extends cc.Component {

    /** 状态机配置 Prefab（包含 StateMachineConfig 组件） */
    @property(cc.Prefab)
    configPrefab: cc.Prefab = null;

    /** 动画播放器引用 */
    @property(SpriteAnimPlayer)
    animPlayer: SpriteAnimPlayer = null;

    // ── 内部状态 ─────────────────────────────────────────────
    private _config: StateMachineConfig = null;
    private _currentState: string = "";
    private _animStateMap: Map<string, SpriteAnimState> = new Map();
    private _loaded: boolean = false;

    /** 角色参数表，外部通过 setParameter / getParameter 读写 */
    private _params: { [key: string]: number } = {};

    /** 当前帧待处理的输入动作队列 */
    private _pendingInputs: string[] = [];
    /** 当前帧待处理的松键队列 */
    private _pendingReleases: string[] = [];
    /** 当前帧待处理的双击队列 */
    private _pendingDoubleTaps: string[] = [];
    /** 各动作上次按下的时间戳（秒），用于双击检测 */
    private _lastTapTime: { [key: string]: number } = {};
    /** 双击判定时间窗口（秒） */
    private readonly _DOUBLE_TAP_WINDOW = 0.3;
    /** 当前正在按住的动作集合，用于防止松键时对手方向还在按导致误触发 */
    private _heldKeys: Set<string> = new Set();

    // ── 生命周期 ─────────────────────────────────────────────
    onLoad() {
        initKeyMap();

        if (!this.configPrefab) {
            cc.warn("[StateMachineComponent] configPrefab 未配置");
            return;
        }

        const configNode = cc.instantiate(this.configPrefab);
        this._config = configNode.getComponent(StateMachineConfig);
        if (!this._config) {
            cc.error("[StateMachineComponent] configPrefab 上未找到 StateMachineConfig 组件");
            configNode.destroy();
            return;
        }

        // 注册键盘输入
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, this._onKeyDown, this);
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_UP,   this._onKeyUp,   this);

        // 监听动画结束事件
        if (this.animPlayer) {
            this.animPlayer.node.on("anim-finished", this._onAnimFinished, this);
        }

        this._loadAnimStates();
    }

    onDestroy() {
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_DOWN, this._onKeyDown, this);
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_UP,   this._onKeyUp,   this);
        if (this.animPlayer) {
            this.animPlayer.node.off("anim-finished", this._onAnimFinished, this);
        }
        // 销毁临时实例化的 config 节点
        if (this._config) {
            this._config.node.destroy();
        }
    }

    update(_dt: number) {
        if (!this._loaded) return;

        // 双击优先处理，避免被单击覆盖
        if (this._pendingDoubleTaps.length > 0) {
            for (const action of this._pendingDoubleTaps) {
                this._tryTransition(ConditionType.OnDoubleTap, action);
            }
            this._pendingDoubleTaps.length = 0;
        }

        if (this._pendingInputs.length > 0) {
            for (const action of this._pendingInputs) {
                this._tryTransition(ConditionType.OnInput, action);
            }
            this._pendingInputs.length = 0;
        }

        if (this._pendingReleases.length > 0) {
            for (const action of this._pendingReleases) {
                // 方向键松开时，若还有方向键被按住则不停止，改为触发对应 OnInput
                if (action === 'Left' || action === 'Right') {
                    const hasLeft  = this._heldKeys.has('Left');
                    const hasRight = this._heldKeys.has('Right');
                    if (hasLeft || hasRight) {
                        // 两个都按着时以"仍然按住的那个"为准（另一个刚松开）
                        const activeDir = (hasLeft && hasRight)
                            ? (action === 'Left' ? 'Right' : 'Left')
                            : (hasLeft ? 'Left' : 'Right');
                        this._tryTransition(ConditionType.OnInput, activeDir);
                        continue;
                    }
                    // 仅剩上下键按住：维持当前移动状态，不触发停止
                    if (this._heldKeys.has('Up')   || this._heldKeys.has('W') ||
                        this._heldKeys.has('Down') || this._heldKeys.has('S')) {
                        continue;
                    }
                }
                this._tryTransition(ConditionType.OnInputRelease, action);
            }
            this._pendingReleases.length = 0;
        }
    }

    // ── 私有方法 ─────────────────────────────────────────────
    private _loadAnimStates() {
        const folder = this._config.animStatesFolder;
        if (!folder) {
            cc.warn("[StateMachineComponent] animStatesFolder 未配置，跳过动画加载");
            this._finishLoad();
            return;
        }

        cc.resources.loadDir(folder, cc.Prefab, (err, prefabs: cc.Prefab[]) => {
            if (err) {
                cc.error("[StateMachineComponent] 加载动画状态失败:", err);
                this._finishLoad();
                return;
            }

            for (const prefab of prefabs) {
                const node = cc.instantiate(prefab);
                const state = node.getComponent(SpriteAnimState);
                if (state) {
                    this._animStateMap.set(state.stateName, state);
                } else {
                    cc.warn(`[StateMachineComponent] Prefab "${prefab.name}" 上未找到 SpriteAnimState，已跳过`);
                    node.destroy();
                }
            }

            cc.log(`[StateMachineComponent] 已加载 ${this._animStateMap.size} 个动画状态: [${Array.from(this._animStateMap.keys()).join(", ")}]`);

            // 批量预加载所有状态的序列帧图片，全部完成后再初始化状态机
            const states = Array.from(this._animStateMap.values());
            let remaining = states.length;
            if (remaining === 0) {
                this._finishLoad();
                return;
            }
            for (const state of states) {
                state.preload((err) => {
                    if (err) cc.warn(`[StateMachineComponent] ${err.message}`);
                    remaining--;
                    if (remaining === 0) {
                        this._finishLoad();
                    }
                });
            }
        });
    }

    private _finishLoad() {
        this._loaded = true;
        if (this._config.defaultState) {
            this._enterState(this._config.defaultState);
        }
        // 检查是否有 Immediate 转换
        this._tryTransition(ConditionType.Immediate, null);
    }

    private _onKeyDown(event: cc.Event.EventKeyboard) {
        const action = KEY_ACTION_MAP[event.keyCode];
        if (!action) return;

        this._heldKeys.add(action);

        // 左右键翻转朝向（默认图片朝右）
        if (action === 'Left')  this.node.scaleX = -Math.abs(this.node.scaleX);
        if (action === 'Right') this.node.scaleX =  Math.abs(this.node.scaleX);

        // 双击检测：窗口内再次按下同一键则记为双击
        const now = Date.now() / 1000;
        const last = this._lastTapTime[action] || -999;
        if (now - last < this._DOUBLE_TAP_WINDOW) {
            this._pendingDoubleTaps.push(action);
            this._lastTapTime[action] = -999; // 消费掉，避免三连也触发
        } else {
            this._lastTapTime[action] = now;
        }

        this._pendingInputs.push(action);
    }

    private _onKeyUp(event: cc.Event.EventKeyboard) {
        const action = KEY_ACTION_MAP[event.keyCode];
        if (!action) return;

        this._heldKeys.delete(action);

        // 左右方向键：若还有方向键按住，不触发松键转换（保持 Walk/Run 状态）
        if (action === 'Left' || action === 'Right') {
            const otherDir = action === 'Left' ? 'Right' : 'Left';
            if (this._heldKeys.has(otherDir)) {
                // 对向水平键按住：切换朝向
                this.node.scaleX = otherDir === 'Right'
                    ? Math.abs(this.node.scaleX)
                    : -Math.abs(this.node.scaleX);
                return;
            }
            // 上下键按住：维持移动状态，无需切换朝向
            if (this._heldKeys.has('Up')   || this._heldKeys.has('W') ||
                this._heldKeys.has('Down') || this._heldKeys.has('S')) {
                return;
            }
        }

        this._pendingReleases.push(action);
    }

    private _onAnimFinished(_stateName: string) {
        this._tryTransition(ConditionType.OnAnimFinish, null);
    }

    /**
     * 查找并执行满足条件的最高优先级转换
     * 先查当前状态的 transitions，再查 globalTransitions，取最高优先级
     * @param conditionType 触发条件类型
     * @param inputAction   当 conditionType = OnInput 时，对应的输入动作名
     */
    private _tryTransition(conditionType: ConditionType, inputAction: string | null) {
        if (!this._config) return;

        let best: OutgoingTransition = null;

        // 当前状态的出向转换
        const stateCfg = this._findStateCfg(this._currentState);
        const localList = stateCfg ? stateCfg.transitions : [];

        // 全局转换（任意状态均可触发）
        const globalList = this._config.globalTransitions;

        const lists = [localList, globalList];
        for (let li = 0; li < lists.length; li++) {
            const list = lists[li];
            for (let i = 0; i < list.length; i++) {
                const t = list[i];
                if (t.conditionType !== conditionType) continue;
                if ((conditionType === ConditionType.OnInput ||
                     conditionType === ConditionType.OnInputRelease ||
                     conditionType === ConditionType.OnDoubleTap) &&
                    t.inputAction !== inputAction) continue;
                if (!t.canInterrupt && conditionType !== ConditionType.OnAnimFinish) {
                    const animState = this._animStateMap.get(this._currentState);
                    if (animState && !animState.loop && this.animPlayer) continue;
                }
                if (!this._checkExtraConditions(t)) continue;
                if (!best || t.priority > best.priority) {
                    best = t;
                }
            }
        }

        if (best) {
            this._enterState(best.toState);
        }
    }

    /**
     * 校验帧窗口 + 参数条件，全部通过才返回 true
     */
    private _checkExtraConditions(t: OutgoingTransition): boolean {
        // 帧窗口检查
        if (t.minFrame >= 0 || t.maxFrame >= 0) {
            const frame = this.animPlayer ? this.animPlayer.currentFrameIndex : 0;
            if (t.minFrame >= 0 && frame < t.minFrame) return false;
            if (t.maxFrame >= 0 && frame > t.maxFrame) return false;
        }

        // 参数条件检查（所有条件须同时满足）
        for (let i = 0; i < t.conditions.length; i++) {
            const c = t.conditions[i];
            const actual = this._params[c.paramName] !== undefined ? this._params[c.paramName] : 0;
            let pass = false;
            switch (c.compareOp) {
                case CompareOp.Equal:          pass = actual === c.value; break;
                case CompareOp.NotEqual:       pass = actual !== c.value; break;
                case CompareOp.Greater:        pass = actual >   c.value; break;
                case CompareOp.GreaterOrEqual: pass = actual >=  c.value; break;
                case CompareOp.Less:           pass = actual <   c.value; break;
                case CompareOp.LessOrEqual:    pass = actual <=  c.value; break;
            }
            if (!pass) return false;
        }
        return true;
    }

    private _findStateCfg(stateName: string): StateNodeConfig | null {
        const states = this._config.states;
        for (let i = 0; i < states.length; i++) {
            if (states[i].stateName === stateName) return states[i];
        }
        return null;
    }

    private _enterState(stateName: string) {
        if (stateName === this._currentState) return;

        const prevState = this._currentState;
        this._currentState = stateName;

        // 播放对应动画
        const animState = this._animStateMap.get(stateName);
        if (animState && this.animPlayer) {
            this.animPlayer.play(animState);
        } else if (!animState) {
            cc.warn(`[StateMachineComponent] 动画状态未找到: "${stateName}"，请检查 animStatesFolder 或 stateName 配置`);
        }

        // 发出状态变化事件，供 Visualizer 等监听
        this.node.emit("state-changed", { from: prevState, to: stateName });
        cc.log(`[StateMachineComponent] ${prevState || "(init)"} → ${stateName}`);

        // 检查进入新状态后是否有 Immediate 转换
        this._tryTransition(ConditionType.Immediate, null);
    }

    // ── 公共接口 ─────────────────────────────────────────────

    /** 获取当前状态名 */
    getCurrentState(): string {
        return this._currentState;
    }

    /** 获取运行时配置对象 */
    getConfig(): StateMachineConfig {
        return this._config;
    }

    /** 是否已加载完毕（配置 + 动画均已就绪） */
    isLoaded(): boolean {
        return this._loaded;
    }

    /**
     * 手动触发输入动作（供 AI 或其他外部系统调用）
     * @param action InputAction 枚举值或其字符串名称
     */
    triggerInput(action: string) {
        if (this._loaded) {
            this._pendingInputs.push(action);
        }
    }

    /**
     * 直接强制切换到指定状态（绕过转换规则，用于特殊逻辑）
     */
    forceChangeState(stateName: string) {
        this._enterState(stateName);
    }

    /**
     * 获取指定名称的动画状态对象（供外部读取 frameCount / fps 等属性）
     */
    getAnimState(stateName: string): SpriteAnimState | null {
        return this._animStateMap.get(stateName) ?? null;
    }

    /**
     * 设置角色参数，供转换条件检查使用
     * @param key   参数名，与 ParameterCondition.paramName 对应
     * @param value 数值（未设置过的参数默认视为 0）
     */
    setParameter(key: string, value: number) {
        this._params[key] = value;
    }

    /**
     * 读取角色参数（未设置过返回 0）
     */
    getParameter(key: string): number {
        return this._params[key] !== undefined ? this._params[key] : 0;
    }
}
