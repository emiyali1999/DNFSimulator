'use strict';

// ─── 工具函数 ──────────────────────────────────────────────────────────────────

function findNodeByPath(path) {
  if (!path || path === '/' || path === '') {
    return cc.director.getScene();
  }
  return cc.find(path.replace(/^\//, ''));
}

function findNodeByUuid(uuid) {
  return searchByUuid(cc.director.getScene(), uuid);
}

function searchByUuid(node, uuid) {
  if (!node) return null;
  if (node.uuid === uuid) return node;
  for (let i = 0; i < node.children.length; i++) {
    const found = searchByUuid(node.children[i], uuid);
    if (found) return found;
  }
  return null;
}

function findNodeByArgs(args) {
  if (args.nodePath !== undefined && args.nodePath !== '') {
    return findNodeByPath(args.nodePath);
  }
  if (args.nodeUuid) {
    return findNodeByUuid(args.nodeUuid);
  }
  return null;
}

function getNodePath(node) {
  const parts = [];
  let cur = node;
  while (cur && !(cur instanceof cc.Scene)) {
    parts.unshift(cur.name);
    cur = cur.parent;
  }
  return parts.join('/');
}

function serializeNode(node, depth, maxDepth) {
  if (!node) return null;
  depth = depth || 0;
  maxDepth = maxDepth || 5;
  if (depth > maxDepth) return null;

  const components = [];
  if (node._components) {
    for (let i = 0; i < node._components.length; i++) {
      const c = node._components[i];
      components.push({
        type: cc.js.getClassName(c),
        enabled: c.enabled,
      });
    }
  }

  const children = [];
  for (let i = 0; i < node.children.length; i++) {
    const child = serializeNode(node.children[i], depth + 1, maxDepth);
    if (child) children.push(child);
  }

  return {
    uuid: node.uuid,
    name: node.name,
    active: node.active,
    position: { x: node.x, y: node.y },
    size: { w: node.width, h: node.height },
    anchorPoint: { x: node.anchorX, y: node.anchorY },
    angle: node.angle,
    scale: { x: node.scaleX, y: node.scaleY },
    opacity: node.opacity,
    components: components,
    children: children,
  };
}

function resolveComponentClass(typeName) {
  if (!typeName) return null;
  // 去掉 'cc.' 前缀
  const name = typeName.replace(/^cc\./, '');
  if (cc[name]) return cc[name];
  // 自定义脚本组件（已在场景中注册的）
  return cc.js.getClassByName(typeName) || cc.js.getClassByName(name) || null;
}

function hexToColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return new cc.Color(r, g, b, 255);
}

// ─── 导出的场景脚本方法 ────────────────────────────────────────────────────────

module.exports = {

  // 查询节点树
  getSceneTree(args, callback) {
    try {
      const scene = cc.director.getScene();
      callback(null, serializeNode(scene));
    } catch (e) {
      callback(e.message);
    }
  },

  // 创建节点
  // args: { parentPath?, name, type? }
  // type: 'Node' | 'Sprite' | 'Label' | 'Button' | 'Layout' | 'Widget'
  createNode(args, callback) {
    try {
      const parent = (args.parentPath !== undefined && args.parentPath !== '')
        ? findNodeByPath(args.parentPath)
        : cc.director.getScene();

      if (!parent) {
        return callback('Parent node not found: ' + args.parentPath);
      }

      const node = new cc.Node(args.name || 'NewNode');
      parent.addChild(node);

      const typeMap = {
        'Sprite': cc.Sprite,
        'Label':  cc.Label,
        'Button': cc.Button,
        'Layout': cc.Layout,
        'Widget': cc.Widget,
        'RichText': cc.RichText,
        'EditBox': cc.EditBox,
        'ScrollView': cc.ScrollView,
        'Toggle': cc.Toggle,
        'Slider': cc.Slider,
        'ProgressBar': cc.ProgressBar,
      };

      if (args.type && args.type !== 'Node' && typeMap[args.type]) {
        node.addComponent(typeMap[args.type]);
      }

      callback(null, {
        uuid: node.uuid,
        name: node.name,
        path: getNodePath(node),
      });
    } catch (e) {
      callback(e.message);
    }
  },

  // 删除节点
  // args: { nodePath? | nodeUuid? }
  deleteNode(args, callback) {
    try {
      const node = findNodeByArgs(args);
      if (!node) return callback('Node not found');
      const name = node.name;
      node.destroy();
      callback(null, { ok: true, deleted: name });
    } catch (e) {
      callback(e.message);
    }
  },

  // 设置节点属性
  // args: { nodePath? | nodeUuid?, property, value }
  setNodeProperty(args, callback) {
    try {
      const node = findNodeByArgs(args);
      if (!node) return callback('Node not found: ' + (args.nodePath || args.nodeUuid));

      const { property, value } = args;
      switch (property) {
        case 'x':       node.x = value; break;
        case 'y':       node.y = value; break;
        case 'width':   node.width = value; break;
        case 'height':  node.height = value; break;
        case 'name':    node.name = value; break;
        case 'active':  node.active = value; break;
        case 'angle':   node.angle = value; break;
        case 'scaleX':  node.scaleX = value; break;
        case 'scaleY':  node.scaleY = value; break;
        case 'opacity': node.opacity = value; break;
        case 'anchorX': node.anchorX = value; break;
        case 'anchorY': node.anchorY = value; break;
        case 'color': {
          if (typeof value === 'string') {
            node.color = hexToColor(value);
          } else {
            node.color = new cc.Color(value.r, value.g, value.b, value.a !== undefined ? value.a : 255);
          }
          break;
        }
        case 'zIndex': node.zIndex = value; break;
        case 'parent': {
          const newParent = findNodeByPath(value);
          if (!newParent) return callback('New parent not found: ' + value);
          node.parent = newParent;
          break;
        }
        default:
          return callback('Unknown property: ' + property);
      }

      callback(null, { ok: true, nodeUuid: node.uuid, property: property, value: value });
    } catch (e) {
      callback(e.message);
    }
  },

  // 批量设置属性
  // args: { nodePath? | nodeUuid?, props: { property: value, ... } }
  setMultipleProps(args, callback) {
    try {
      const node = findNodeByArgs(args);
      if (!node) return callback('Node not found');

      const props = args.props || {};
      const keys = Object.keys(props);
      for (let i = 0; i < keys.length; i++) {
        const property = keys[i];
        const value = props[property];
        switch (property) {
          case 'x':       node.x = value; break;
          case 'y':       node.y = value; break;
          case 'width':   node.width = value; break;
          case 'height':  node.height = value; break;
          case 'name':    node.name = value; break;
          case 'active':  node.active = value; break;
          case 'angle':   node.angle = value; break;
          case 'scaleX':  node.scaleX = value; break;
          case 'scaleY':  node.scaleY = value; break;
          case 'opacity': node.opacity = value; break;
          case 'anchorX': node.anchorX = value; break;
          case 'anchorY': node.anchorY = value; break;
          case 'zIndex':  node.zIndex = value; break;
          case 'color': {
            if (typeof value === 'string') {
              node.color = hexToColor(value);
            } else {
              node.color = new cc.Color(value.r, value.g, value.b, value.a !== undefined ? value.a : 255);
            }
            break;
          }
        }
      }

      callback(null, { ok: true, nodeUuid: node.uuid, updatedProps: keys });
    } catch (e) {
      callback(e.message);
    }
  },

  // 添加组件
  // args: { nodePath? | nodeUuid?, componentType }
  addComponent(args, callback) {
    try {
      const node = findNodeByArgs(args);
      if (!node) return callback('Node not found');

      const compClass = resolveComponentClass(args.componentType);
      if (!compClass) return callback('Component type not found: ' + args.componentType);

      // 检查是否已经存在
      if (node.getComponent(compClass)) {
        return callback(null, { ok: true, alreadyExists: true, componentType: args.componentType });
      }

      const comp = node.addComponent(compClass);
      callback(null, {
        ok: true,
        componentType: cc.js.getClassName(comp),
      });
    } catch (e) {
      callback(e.message);
    }
  },

  // 设置组件引用属性（相当于拖拽赋值）
  // args: {
  //   nodePath? | nodeUuid?,
  //   componentType,
  //   property,
  //   refType: 'node' | 'component' | 'asset',
  //   refValue: nodePath or uuid,
  //   refComponentType?,   // refType='component' 时使用
  // }
  setComponentRef(args, callback) {
    try {
      const node = findNodeByArgs(args);
      if (!node) return callback('Node not found: ' + (args.nodePath || args.nodeUuid));

      const compClass = resolveComponentClass(args.componentType);
      if (!compClass) return callback('Component class not found: ' + args.componentType);

      const comp = node.getComponent(compClass);
      if (!comp) return callback(`Component ${args.componentType} not found on node ${node.name}`);

      const { property, refType, refValue, refComponentType } = args;

      if (refType === 'node') {
        const refNode = findNodeByPath(refValue) || findNodeByUuid(refValue);
        if (!refNode) return callback('Reference node not found: ' + refValue);
        comp[property] = refNode;
        callback(null, { ok: true });

      } else if (refType === 'component') {
        const refNode = findNodeByPath(refValue) || findNodeByUuid(refValue);
        if (!refNode) return callback('Reference node not found: ' + refValue);
        const refCompClass = resolveComponentClass(refComponentType);
        if (!refCompClass) return callback('Reference component class not found: ' + refComponentType);
        const refComp = refNode.getComponent(refCompClass);
        if (!refComp) return callback(`Component ${refComponentType} not found on reference node`);
        comp[property] = refComp;
        callback(null, { ok: true });

      } else if (refType === 'asset') {
        cc.loader.load({ uuid: refValue }, function(err, asset) {
          if (err) return callback('Asset load failed: ' + err);
          comp[property] = asset;
          callback(null, { ok: true });
        });

      } else {
        callback('Unknown refType: ' + refType + '. Use: node | component | asset');
      }
    } catch (e) {
      callback(e.message);
    }
  },

  // 查找节点
  // args: { nodePath? | nodeUuid? }
  findNode(args, callback) {
    try {
      const node = findNodeByArgs(args);
      if (!node) return callback(null, { found: false });
      callback(null, {
        found: true,
        uuid: node.uuid,
        name: node.name,
        path: getNodePath(node),
        active: node.active,
        position: { x: node.x, y: node.y },
        size: { w: node.width, h: node.height },
      });
    } catch (e) {
      callback(e.message);
    }
  },
};
