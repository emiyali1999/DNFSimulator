/**
 * 状态机运行时组件
 * 挂在 Unit 节点上，负责：
 *   - 加载 StateMachineConfig 和所有动画状态
 *   - 监听键盘输入和动画结束事件
 *   - 根据 TransitionConfig 规则执行状态转换
 *   - 驱动 SpriteAnimPlayer 播放对应动画
 */

import StateMachineConfig, { ConditionType, OutgoingTransition, StateNodeConfig } from "./StateMachineConfig";
import SpriteAnimPlayer from "../SpriteAnimPlayer";
import SpriteAnimState from "../SpriteAnimState";
import { initKeyMap, KEY_ACTION_MAP } from "./InputAction";
import BattleSystem from "../Battle/BattleSystem";

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

    /**
     * 创建者单位 ID，由 Unit.onLoad 写入，供技能盒子生成时使用
     * -1 表示未关联单位（独立使用状态机时）
     */
    creatorId: number = -1;

    /** 上一帧检测到的动画帧索引，用于逐帧检测技能盒子生成时机 */
    private _lastAnimFrame: number = -1;

    /** 当前帧待处理的输入动作队列 */
    private _pendingInputs: string[] = [];
    /** 当前帧待处理的松键队列 */
    private _pendingReleases: string[] = [];
    /** 当前帧待处理的双击队列 */
    private _pendingDoubleTaps: string[] = [];
    /** 当前帧待处理的组合键队列（手搓招式） */
    private _pendingCombos: string[] = [];
    /** 各动作上次按下的时间戳（秒），用于双击检测 */
    private _lastTapTime: { [key: string]: number } = {};
    /** 双击判定时间窗口（秒） */
    private readonly _DOUBLE_TAP_WINDOW = 0.3;
    /** 当前正在按住的动作集合，用于防止松键时对手方向还在按导致误触发 */
    private _heldKeys: Set<string> = new Set();
    /** 最后按下的横向方向：1 = 右，-1 = 左，0 = 未按过 */
    private _lastHorizDir: number = 0;
    /** 当前正在执行的转换所对应的输入动作，用于防止 _enterState 补发时重放触发键 */
    private _activeTransitionAction: string | null = null;
    /** 当前是否处于 _onAnimFinished 回调中，用于允许 canInterrupt=false 的 OnInputHeld 在动画结束时触发 */
    private _inAnimFinished: boolean = false;

    /**
     * 预输入缓冲：记录最后一次按下的技能键及按下时的动画帧索引
     * 若在当前帧窗口开放前的 preInputFrames 帧内按下，可在窗口开放时自动触发
     * 按下其他技能键时立即清除
     */
    private _preInputBuffer: { action: string; pressedAtAnimFrame: number } | null = null;

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

        // 组合键（手搓招式）最优先处理，触发后消费对应 OnInput
        if (this._pendingCombos.length > 0) {
            const comboSet = new Set(this._pendingCombos);
            const stateBefore = this._currentState;
            for (const action of this._pendingCombos) {
                this._tryTransition(ConditionType.OnCombo, action);
                if (this._currentState !== stateBefore) break;
            }
            if (this._currentState !== stateBefore) {
                this._pendingInputs = this._pendingInputs.filter(a => !comboSet.has(a));
            }
            this._pendingCombos.length = 0;
        }

        // 双击优先处理，避免被单击覆盖
        if (this._pendingDoubleTaps.length > 0) {
            const doubleTapSet = new Set(this._pendingDoubleTaps);
            const stateBefore = this._currentState;
            for (const action of this._pendingDoubleTaps) {
                this._tryTransition(ConditionType.OnDoubleTap, action);
            }
            // 只有双击真正触发了状态切换时才消费对应的 OnInput
            // 若状态未变（如当前状态无匹配的 DoubleTap 转换），保留 OnInput 让连招正常触发
            if (this._currentState !== stateBefore) {
                this._pendingInputs = this._pendingInputs.filter(a => !doubleTapSet.has(a));
            }
            this._pendingDoubleTaps.length = 0;
        }

        if (this._pendingInputs.length > 0) {
            for (const action of this._pendingInputs) {
                this._tryTransition(ConditionType.OnInput, action);
            }
            this._pendingInputs.length = 0;
        }

        // 预输入缓冲：尝试触发之前缓冲的技能键
        this._processPreInputBuffer();

        // 持续按住检测（OnInputHeld）：按住键时每帧检查，满足帧窗口自动触发
        if (this._heldKeys.size > 0) {
            this._heldKeys.forEach(action => {
                this._tryTransition(ConditionType.OnInputHeld, action);
            });
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
                    if (this._heldKeys.has('Up') || this._heldKeys.has('Down')) {
                        continue;
                    }
                }
                this._tryTransition(ConditionType.OnInputRelease, action);
            }
            this._pendingReleases.length = 0;
        }

        this._checkSkillBoxSpawns();
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

        // 过滤 OS 按键重复事件：已在按住集合中说明是 key-repeat，跳过
        if (this._heldKeys.has(action)) return;

        this._heldKeys.add(action);

        // 记录最后按下的横向方向
        if (action === 'Left')  this._lastHorizDir = -1;
        if (action === 'Right') this._lastHorizDir =  1;

        // 左右键翻转朝向（lockFacing 状态期间跳过翻转）
        if ((action === 'Left' || action === 'Right') && !this._isCurrentStateLockFacing()) {
            this.node.scaleX = action === 'Left'
                ? -Math.abs(this.node.scaleX)
                :  Math.abs(this.node.scaleX);
        }

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

        // 技能键处理：预输入缓冲 + 组合键队列
        if (this._isSkillKey(action)) {
            // 预输入缓冲
            if (this._preInputBuffer && this._preInputBuffer.action !== action) {
                this._preInputBuffer = null;
            }
            const currentFrame = this.animPlayer ? this.animPlayer.currentFrameIndex : 0;
            this._preInputBuffer = { action, pressedAtAnimFrame: currentFrame };

            // 组合键：只要有修饰键被按住就入队，由 _tryTransition 负责精确检查
            this._pendingCombos.push(action);
        }
    }

    private _onKeyUp(event: cc.Event.EventKeyboard) {
        const action = KEY_ACTION_MAP[event.keyCode];
        if (!action) return;

        this._heldKeys.delete(action);

        // 左右方向键：若还有方向键按住，不触发松键转换（保持 Walk/Run 状态）
        if (action === 'Left' || action === 'Right') {
            const otherDir = action === 'Left' ? 'Right' : 'Left';
            if (this._heldKeys.has(otherDir)) {
                // 对向水平键按住：若未锁定朝向则切换 scaleX，并同步更新 _lastHorizDir
                // 使后续 _enterState 的朝向对齐以新方向为准
                if (!this._isCurrentStateLockFacing()) {
                    this.node.scaleX = otherDir === 'Right'
                        ? Math.abs(this.node.scaleX)
                        : -Math.abs(this.node.scaleX);
                    this._lastHorizDir = otherDir === 'Right' ? 1 : -1;
                }
                // 不 return，继续推入 _pendingReleases
                // update() 中检测到对向键仍按住，会补发 OnInput 对向键
            }
            // 上下键按住：维持移动状态，无需切换朝向
            if (this._heldKeys.has('Up') || this._heldKeys.has('Down')) {
                return;
            }
        }

        this._pendingReleases.push(action);

        // 上下键松开：若无任何方向键按住且当前是移动状态，补发松键停止信号
        if (action === 'Up' || action === 'Down') {
            const hasAnyDir = this._heldKeys.has('Left') || this._heldKeys.has('Right') ||
                              this._heldKeys.has('Up')   || this._heldKeys.has('Down');
            if (!hasAnyDir) {
                const cur = this._currentState;
                if (cur.indexOf('Walk') !== -1 || cur.indexOf('Run') !== -1) {
                    this._pendingReleases.push('Left');
                }
            }
        }
    }

    private _onAnimFinished(_stateName: string) {
        // OnInputHeld 优先：按住某键时若有匹配的 OnInputHeld 转换，则拦截 AnimFinish
        // 典型场景：Attack03 动画结束时 X 仍按住 → 循环 Attack01 而非回 StandBattle
        // _inAnimFinished=true 期间，canInterrupt=false 的 OnInputHeld 转换也允许触发
        this._inAnimFinished = true;
        if (this._heldKeys.size > 0) {
            const stateBefore = this._currentState;
            this._heldKeys.forEach(action => {
                if (this._currentState === stateBefore) {
                    this._tryTransition(ConditionType.OnInputHeld, action);
                }
            });
            if (this._currentState !== stateBefore) {
                this._inAnimFinished = false;
                return;
            }
        }
        this._tryTransition(ConditionType.OnAnimFinish, null);
        this._inAnimFinished = false;
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
        const stateCfg = this._config.findState(this._currentState);
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
                     conditionType === ConditionType.OnDoubleTap ||
                     conditionType === ConditionType.OnCombo ||
                     conditionType === ConditionType.OnInputHeld) &&
                    t.inputAction !== inputAction) continue;
                // OnCombo 额外校验：修饰键格式 "A,B|C" = A 且 (B 或 C)
                // 逗号分组 = AND，竖线分组 = OR
                // 例："Down|S" = 按下箭头下或S键均可；"Down|S,Left|A" = 同时按住下/S 且 左/A
                if (conditionType === ConditionType.OnCombo) {
                    const mods = t.comboModifiers;
                    if (!mods) continue;
                    const groups = mods.split(',');
                    let allGroupsMet = true;
                    for (let gi = 0; gi < groups.length; gi++) {
                        const options = groups[gi].split('|');
                        let anyHeld = false;
                        for (let oi = 0; oi < options.length; oi++) {
                            const m = options[oi].trim();
                            if (!m || this._heldKeys.has(m)) { anyHeld = true; break; }
                        }
                        if (!anyHeld) { allGroupsMet = false; break; }
                    }
                    if (!allGroupsMet) continue;
                }
                // canInsert=true 的转换可绕过 canInterrupt 检查，任意帧直接插入
                // _inAnimFinished=true 时表示动画刚结束，也允许 canInterrupt=false 的转换触发
                if (!t.canInsert && !t.canInterrupt && conditionType !== ConditionType.OnAnimFinish && !this._inAnimFinished) {
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
            this._activeTransitionAction = inputAction;
            this._enterState(best.toState);
            this._activeTransitionAction = null;
        }
    }

    /**
     * 校验帧窗口，通过返回 true
     */
    private _checkExtraConditions(t: OutgoingTransition): boolean {
        // 帧窗口检查（canInsert=true 时跳过，允许任意帧触发）
        if (!t.canInsert && (t.minFrame >= 0 || t.maxFrame >= 0)) {
            const frame = this.animPlayer ? this.animPlayer.currentFrameIndex : 0;
            if (t.minFrame >= 0 && frame < t.minFrame) return false;
            if (t.maxFrame >= 0 && frame > t.maxFrame) return false;
        }
        return true;
    }

    private _enterState(stateName: string) {
        if (stateName === this._currentState) return;

        const prevState = this._currentState;
        this._currentState = stateName;

        // 状态切换时清除预输入缓冲（旧状态的缓冲在新状态中无意义）
        this._preInputBuffer = null;

        // 通知 BattleSystem 销毁该创建者所有绑定状态的技能盒子
        BattleSystem.instance?.notifyStateChange(this.creatorId);

        // 重置帧追踪，确保新状态第 0 帧也能触发生成
        this._lastAnimFrame = -1;

        // 播放对应动画
        const animState = this._animStateMap.get(stateName);
        if (animState && this.animPlayer) {
            this.animPlayer.play(animState);
        } else if (!animState) {
            cc.warn(`[StateMachineComponent] 动画状态未找到: "${stateName}"，请检查 animStatesFolder 或 stateName 配置`);
        }

        // 切换状态时，若新状态允许且有横向键按住，则对齐朝向（以最后按下的方向为准）
        const allowAlign = animState ? animState.alignFacingOnEnter : true;
        if (allowAlign && this._lastHorizDir !== 0 &&
            (this._heldKeys.has('Left') || this._heldKeys.has('Right'))) {
            this.node.scaleX = this._lastHorizDir < 0
                ? -Math.abs(this.node.scaleX)
                :  Math.abs(this.node.scaleX);
        }

        // 发出状态变化事件，供 Visualizer 等监听
        this.node.emit("state-changed", { from: prevState, to: stateName });
        cc.log(`[StateMachineComponent] ${prevState || "(init)"} → ${stateName}`);

        // 检查进入新状态后是否有 Immediate 转换
        this._tryTransition(ConditionType.Immediate, null);

        // Immediate 未触发切换时，补发当前仍按住的方向键
        // 确保技能/攻击结束回到待机状态时，若方向键仍按住能立即恢复移动
        if (this._currentState === stateName) {
            const triggerIsHoriz = this._activeTransitionAction === 'Left' || this._activeTransitionAction === 'Right';
            const dirKeys = ['Left', 'Right', 'Up', 'Down'];
            for (const dir of dirKeys) {
                // 跳过触发当前转换的方向键，避免双击进入 Run 后立刻被该键的 OnInput 打回 Walk
                if (dir === this._activeTransitionAction) continue;
                // 若触发键是水平方向键，也跳过另一个水平方向键
                // （双击换向时，对向键仍按住不应把新方向的 Run 打回 Walk）
                if (triggerIsHoriz && (dir === 'Left' || dir === 'Right')) continue;
                if (this._heldKeys.has(dir)) {
                    this._tryTransition(ConditionType.OnInput, dir);
                    // 已发生状态切换，由新状态的 _enterState 继续处理
                    if (this._currentState !== stateName) break;
                }
            }
        }
    }

    private _isCurrentStateLockFacing(): boolean {
        const animState = this._animStateMap.get(this._currentState);
        return animState ? animState.lockFacing : false;
    }

    /**
     * 每帧检测动画帧是否推进，若推进则检查当前帧是否有配置技能盒子生成
     * 同一帧索引只触发一次（_lastAnimFrame 防重）
     */
    private _checkSkillBoxSpawns() {
        if (!this.animPlayer || !this._loaded) return;

        const frame = this.animPlayer.currentFrameIndex;
        if (frame === this._lastAnimFrame) return;
        this._lastAnimFrame = frame;

        const animState = this._animStateMap.get(this._currentState);
        if (!animState || animState.spawnConfigs.length === 0) return;

        const battle = BattleSystem.instance;
        if (!battle) return;

        // 通过鸭子类型获取创建者当前的三维坐标（避免对 PlayerController 的硬依赖）
        const pc = this.node.getComponent('PlayerController') as any;
        const creatorWorldY: number = pc ? (pc.worldY as number) : 0;
        const creatorWorldZ: number = pc ? (pc.worldZ as number) : 0;

        for (let i = 0; i < animState.spawnConfigs.length; i++) {
            const cfg = animState.spawnConfigs[i];
            if (cfg.frame === frame) {
                battle.spawnBox(cfg, this.node, this.creatorId, creatorWorldY, creatorWorldZ);
            }
        }
    }

    /**
     * 判断是否为技能键（非方向键）
     * 方向键：Left / Right / Up / Down / W / S
     * 技能键：X / Z / C / V / Space / A / D 等
     */
    private _isSkillKey(action: string): boolean {
        return action !== 'Left' && action !== 'Right' &&
               action !== 'Up'  && action !== 'Down';
    }

    /**
     * 预输入缓冲处理：尝试将缓冲的技能键输入重放给当前状态的转换
     *
     * 工作原理：
     *   - 按下技能键时，同步记录到 _preInputBuffer（含按下时的动画帧）
     *   - 每帧检查各条 OnInput 转换的 preInputFrames：
     *     只要有至少一条匹配转换仍在其预输入窗口内，就继续尝试触发
     *   - 所有匹配转换均已超出各自的 preInputFrames 时，缓冲过期并清除
     *   - 状态切换（_enterState）或按下其他技能键时立即清除缓冲
     */
    private _processPreInputBuffer() {
        if (!this._preInputBuffer || !this._config) return;

        const currentFrame = this.animPlayer ? this.animPlayer.currentFrameIndex : 0;
        const animFrameDiff = currentFrame - this._preInputBuffer.pressedAtAnimFrame;

        // 动画帧未推进（仍在同一帧），pendingInputs 本帧已处理过，跳过
        if (animFrameDiff <= 0) return;

        // 检查是否有至少一条匹配转换还在预输入窗口内
        const action = this._preInputBuffer.action;
        const stateCfg = this._config.findState(this._currentState);
        const lists = [
            stateCfg ? stateCfg.transitions : [],
            this._config.globalTransitions,
        ];
        let hasValidWindow = false;
        for (const list of lists) {
            for (const t of list) {
                if ((t.conditionType === ConditionType.OnInput ||
                     t.conditionType === ConditionType.OnCombo) &&
                    t.inputAction === action &&
                    t.preInputFrames > 0 &&
                    animFrameDiff <= t.preInputFrames) {
                    hasValidWindow = true;
                    break;
                }
            }
            if (hasValidWindow) break;
        }

        if (!hasValidWindow) {
            this._preInputBuffer = null;
            return;
        }

        // 先尝试组合键（优先级高），再尝试普通输入；成功后 _enterState 会清除缓冲
        const stateBefore = this._currentState;
        this._tryTransition(ConditionType.OnCombo, action);
        if (this._currentState === stateBefore) {
            this._tryTransition(ConditionType.OnInput, action);
        }
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
     * 立即（同帧）触发输入动作，用于落地等需要即时响应的场景
     */
    triggerInputImmediate(action: string) {
        if (this._loaded) {
            this._tryTransition(ConditionType.OnInput, action);
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

}
