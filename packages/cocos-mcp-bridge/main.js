'use strict';

const http = require('http');

const PORT = 3300;

const ACTION_MAP = {
  'get_scene_tree':       'getSceneTree',
  'create_node':          'createNode',
  'set_node_property':    'setNodeProperty',
  'add_component':        'addComponent',
  'set_component_ref':    'setComponentRef',
  'find_node':            'findNode',
  'delete_node':          'deleteNode',
  'set_multiple_props':   'setMultipleProps',
};

module.exports = {
  load() {
    this._server = http.createServer((req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405);
        res.end('Method Not Allowed');
        return;
      }

      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        let payload;
        try {
          payload = JSON.parse(body);
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
          return;
        }

        const { action, params } = payload;
        const methodName = ACTION_MAP[action];

        if (!methodName) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: `Unknown action: ${action}` }));
          return;
        }

        let done = false;

        // 8秒超时保护
        const timer = setTimeout(() => {
          if (done) return;
          done = true;
          res.writeHead(504);
          res.end(JSON.stringify({ error: 'Scene script timeout (8s)' }));
        }, 8000);

        Editor.Scene.callSceneScript(
          'cocos-mcp-bridge',
          methodName,
          params || {},
          (err, result) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            res.writeHead(err ? 500 : 200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(err ? { error: String(err) } : result));
          }
        );
      });
    });

    this._server.listen(PORT, '127.0.0.1', () => {
      Editor.log(`[cocos-mcp-bridge] HTTP server listening on http://127.0.0.1:${PORT}`);
    });

    this._server.on('error', (err) => {
      Editor.error(`[cocos-mcp-bridge] HTTP server error: ${err.message}`);
    });
  },

  unload() {
    if (this._server) {
      this._server.close();
      Editor.log('[cocos-mcp-bridge] HTTP server stopped');
    }
  },
};
