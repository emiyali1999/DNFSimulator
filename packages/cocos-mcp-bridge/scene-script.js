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
  for (var i = 0; i < node.children.length; i++) {
    var found = searchByUuid(node.children[i], uuid);
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
  var parts = [];
  var cur = node;
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

  var components = [];
  if (node._components) {
    for (var i = 0; i < node._components.length; i++) {
      var c = node._components[i];
      components.push({ type: cc.js.getClassName(c), enabled: c.enabled });
    }
  }

  var children = [];
  for (var j = 0; j < node.children.length; j++) {
    var child = serializeNode(node.children[j], depth + 1, maxDepth);
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
  var name = typeName.replace(/^cc\./, '');
  if (cc[name]) return cc[name];
  return cc.js.getClassByName(typeName) || cc.js.getClassByName(name) || null;
}

function hexToColor(hex) {
  var r = parseInt(hex.slice(1, 3), 16);
  var g = parseInt(hex.slice(3, 5), 16);
  var b = parseInt(hex.slice(5, 7), 16);
  return new cc.Color(r, g, b, 255);
}

function applyProperty(node, property, value) {
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
    case 'parent': {
      var newParent = findNodeByPath(value);
      if (!newParent) throw new Error('New parent not found: ' + value);
      node.parent = newParent;
      break;
    }
    default:
      throw new Error('Unknown property: ' + property);
  }
}

// ─── CC2.4.15 scene-script 正确格式 ───────────────────────────────────────────
// 签名: function(event, opts)
//   event.reply(err, result) — 将结果返回给 callSceneScript callback
//   opts — 调用方传入的参数对象

module.exports = {

  getSceneTree: function(event, opts) {
    try {
      event.reply(null, serializeNode(cc.director.getScene()));
    } catch (e) {
      event.reply(e.message);
    }
  },

  createNode: function(event, opts) {
    try {
      var args = opts || {};
      var parent = (args.parentPath !== undefined && args.parentPath !== '')
        ? findNodeByPath(args.parentPath)
        : cc.director.getScene();
      if (!parent) { event.reply('Parent node not found: ' + args.parentPath); return; }

      var node = new cc.Node(args.name || 'NewNode');
      parent.addChild(node);

      var typeMap = {
        'Sprite': cc.Sprite, 'Label': cc.Label, 'Button': cc.Button,
        'Layout': cc.Layout, 'Widget': cc.Widget, 'RichText': cc.RichText,
        'EditBox': cc.EditBox, 'ScrollView': cc.ScrollView, 'Toggle': cc.Toggle,
        'Slider': cc.Slider, 'ProgressBar': cc.ProgressBar,
      };
      if (args.type && args.type !== 'Node' && typeMap[args.type]) {
        node.addComponent(typeMap[args.type]);
      }
      event.reply(null, { uuid: node.uuid, name: node.name, path: getNodePath(node) });
    } catch (e) {
      event.reply(e.message);
    }
  },

  deleteNode: function(event, opts) {
    try {
      var node = findNodeByArgs(opts || {});
      if (!node) { event.reply('Node not found'); return; }
      var name = node.name;
      node.destroy();
      event.reply(null, { ok: true, deleted: name });
    } catch (e) {
      event.reply(e.message);
    }
  },

  setNodeProperty: function(event, opts) {
    try {
      var args = opts || {};
      var node = findNodeByArgs(args);
      if (!node) { event.reply('Node not found: ' + (args.nodePath || args.nodeUuid)); return; }
      applyProperty(node, args.property, args.value);
      event.reply(null, { ok: true, nodeUuid: node.uuid, property: args.property, value: args.value });
    } catch (e) {
      event.reply(e.message);
    }
  },

  setMultipleProps: function(event, opts) {
    try {
      var args = opts || {};
      var node = findNodeByArgs(args);
      if (!node) { event.reply('Node not found'); return; }
      var props = args.props || {};
      var keys = Object.keys(props);
      for (var i = 0; i < keys.length; i++) {
        applyProperty(node, keys[i], props[keys[i]]);
      }
      event.reply(null, { ok: true, nodeUuid: node.uuid, updatedProps: keys });
    } catch (e) {
      event.reply(e.message);
    }
  },

  addComponent: function(event, opts) {
    try {
      var args = opts || {};
      var node = findNodeByArgs(args);
      if (!node) { event.reply('Node not found'); return; }
      var compClass = resolveComponentClass(args.componentType);
      if (!compClass) { event.reply('Component type not found: ' + args.componentType); return; }
      if (node.getComponent(compClass)) {
        event.reply(null, { ok: true, alreadyExists: true, componentType: args.componentType });
        return;
      }
      var comp = node.addComponent(compClass);
      event.reply(null, { ok: true, componentType: cc.js.getClassName(comp) });
    } catch (e) {
      event.reply(e.message);
    }
  },

  setComponentRef: function(event, opts) {
    try {
      var args = opts || {};
      var node = findNodeByArgs(args);
      if (!node) { event.reply('Node not found: ' + (args.nodePath || args.nodeUuid)); return; }
      var compClass = resolveComponentClass(args.componentType);
      if (!compClass) { event.reply('Component class not found: ' + args.componentType); return; }
      var comp = node.getComponent(compClass);
      if (!comp) { event.reply('Component ' + args.componentType + ' not found on node ' + node.name); return; }

      if (args.refType === 'node') {
        var refNode = findNodeByPath(args.refValue) || findNodeByUuid(args.refValue);
        if (!refNode) { event.reply('Reference node not found: ' + args.refValue); return; }
        comp[args.property] = refNode;
        event.reply(null, { ok: true });
      } else if (args.refType === 'component') {
        var refNode2 = findNodeByPath(args.refValue) || findNodeByUuid(args.refValue);
        if (!refNode2) { event.reply('Reference node not found: ' + args.refValue); return; }
        var refCompClass = resolveComponentClass(args.refComponentType);
        if (!refCompClass) { event.reply('Reference component class not found: ' + args.refComponentType); return; }
        var refComp = refNode2.getComponent(refCompClass);
        if (!refComp) { event.reply('Component ' + args.refComponentType + ' not found on reference node'); return; }
        comp[args.property] = refComp;
        event.reply(null, { ok: true });
      } else {
        event.reply('Unknown refType: ' + args.refType);
      }
    } catch (e) {
      event.reply(e.message);
    }
  },

  findNode: function(event, opts) {
    try {
      var node = findNodeByArgs(opts || {});
      if (!node) { event.reply(null, { found: false }); return; }
      event.reply(null, {
        found: true,
        uuid: node.uuid,
        name: node.name,
        path: getNodePath(node),
        active: node.active,
        position: { x: node.x, y: node.y },
        size: { w: node.width, h: node.height },
      });
    } catch (e) {
      event.reply(e.message);
    }
  },
};
