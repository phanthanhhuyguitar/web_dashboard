import { memo, useCallback, useEffect, useRef, useState } from 'react';

import {
  buildOrgUnitTree,
  fetchOrganizationUnits,
  updateOrgUnitNodeInTree,
} from '../../api/orgUnitsApi.js';

function findNodeByKey(nodes, key) {
  if (!key || !Array.isArray(nodes)) return null;

  for (const node of nodes) {
    if (String(node.key) === String(key)) {
      return node;
    }

    const childNode = findNodeByKey(node.children, key);

    if (childNode) {
      return childNode;
    }
  }

  return null;
}

function TreeNode({ node, depth, expandedKeys, selectedKey, onToggle, onSelect, onContextMenu }) {
  const isExpanded = expandedKeys.has(node.key);
  const isSelected = selectedKey === node.key;
  const hasChildren = node.children.length > 0;

  return (
    <li className="org-tree-item">
      <div
        className={`org-tree-node${isSelected ? ' is-selected' : ''}`}
        style={{ '--tree-depth': depth }}
      >
        <button
          className={`org-tree-toggle${hasChildren ? '' : ' is-empty'}`}
          type="button"
          aria-label={hasChildren ? (isExpanded ? 'Thu gọn đơn vị' : 'Mở rộng đơn vị') : 'Không có đơn vị con'}
          onClick={(event) => {
            event.stopPropagation();

            if (hasChildren) {
              onToggle(node.key);
            }
          }}
        >
          {hasChildren ? (isExpanded ? '-' : '+') : ''}
        </button>

        <button
          className="org-tree-label"
          type="button"
          onClick={() => onSelect(node.key)}
          onContextMenu={(event) => onContextMenu(event, node)}
          title={node.code ? `${node.title} - ${node.code}` : node.title}
        >
          <span className="org-tree-branch" aria-hidden="true" />
          <span className="org-tree-title">{node.title}</span>
        </button>
      </div>

      {hasChildren && isExpanded ? (
        <ul className="org-tree-list">
          {node.children.map((child) => (
            <TreeNode
              depth={depth + 1}
              expandedKeys={expandedKeys}
              key={child.key}
              node={child}
              selectedKey={selectedKey}
              onContextMenu={onContextMenu}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function OrgUnitTree({ onCreateNode, onDeleteNode, onEditNode, onSelectedNodeChange, refreshKey = 0, updatedOrgUnit }) {
  const [treeData, setTreeData] = useState([]);
  const [expandedKeys, setExpandedKeys] = useState(() => new Set());
  const [selectedKey, setSelectedKey] = useState('');
  const [contextMenu, setContextMenu] = useState(null);
  const [status, setStatus] = useState('idle');
  const didLoadRef = useRef(false);
  const isMountedRef = useRef(false);
  const isRequestingRef = useRef(false);
  const hasTreeDataRef = useRef(false);
  const selectedKeyRef = useRef('');

  useEffect(() => {
    selectedKeyRef.current = selectedKey;
  }, [selectedKey]);

  const loadOrgUnits = useCallback(async ({ forceRefresh = false, selectFirst = true } = {}) => {
    if (isRequestingRef.current) return;
    if (!forceRefresh && hasTreeDataRef.current) return;

    isRequestingRef.current = true;

    if (isMountedRef.current) {
      setStatus('loading');
    }

    try {
      const orgUnits = await fetchOrganizationUnits({ forceRefresh });
      const nextTreeData = buildOrgUnitTree(orgUnits);

      if (!isMountedRef.current) return;

      const currentSelectedNode = findNodeByKey(nextTreeData, selectedKeyRef.current);
      const nextSelectedKey = currentSelectedNode?.key || (selectFirst ? nextTreeData[0]?.key || '' : '');

      hasTreeDataRef.current = nextTreeData.length > 0;
      setTreeData(nextTreeData);
      setExpandedKeys(new Set(nextTreeData.map((node) => node.key)));
      setSelectedKey(nextSelectedKey);
      onSelectedNodeChange?.(findNodeByKey(nextTreeData, nextSelectedKey));
      setStatus('success');
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[ORG_UNITS_ERROR]', {
          status: error?.response?.status,
          message: error?.message,
        });
      }

      if (isMountedRef.current) {
        setStatus('error');
      }
    } finally {
      isRequestingRef.current = false;
    }
  }, [onSelectedNodeChange]);

  useEffect(() => {
    isMountedRef.current = true;

    if (!didLoadRef.current) {
      didLoadRef.current = true;
      loadOrgUnits();
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [loadOrgUnits]);

  useEffect(() => {
    if (!didLoadRef.current || refreshKey === 0) return;

    loadOrgUnits({ forceRefresh: true, selectFirst: false });
  }, [loadOrgUnits, onSelectedNodeChange, refreshKey]);

  useEffect(() => {
    if (!updatedOrgUnit?.id) return;

    setTreeData((currentTreeData) => {
      const nextTreeData = updateOrgUnitNodeInTree(currentTreeData, updatedOrgUnit);
      const nextSelectedNode = findNodeByKey(nextTreeData, selectedKey);

      if (nextSelectedNode) {
        onSelectedNodeChange?.(nextSelectedNode);
      }

      return nextTreeData;
    });
  }, [onSelectedNodeChange, selectedKey, updatedOrgUnit]);

  useEffect(() => {
    if (!contextMenu) return undefined;

    const handleClose = () => setContextMenu(null);
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('click', handleClose);
    window.addEventListener('contextmenu', handleClose);
    window.addEventListener('keydown', handleEscape);
    window.addEventListener('scroll', handleClose, true);

    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('contextmenu', handleClose);
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('scroll', handleClose, true);
    };
  }, [contextMenu]);

  const handleToggle = useCallback((key) => {
    setExpandedKeys((current) => {
      const next = new Set(current);

      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      return next;
    });
  }, []);

  const handleSelect = useCallback(
    (key) => {
      const selectedNode = findNodeByKey(treeData, key);

      setSelectedKey(key);
      onSelectedNodeChange?.(selectedNode);
    },
    [onSelectedNodeChange, treeData]
  );

  const handleRetry = () => {
    loadOrgUnits({ forceRefresh: true });
  };

  const handleNodeContextMenu = useCallback((event, node) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedKey(node.key);
    onSelectedNodeChange?.(node);
    setContextMenu({
      key: node.key,
      title: node.title,
      x: event.clientX,
      y: event.clientY,
    });
  }, [onSelectedNodeChange]);

  const handleContextAction = (action) => {
    const currentNode = findNodeByKey(treeData, contextMenu?.key);

    setContextMenu(null);

    if (action === 'create' && currentNode) {
      onCreateNode?.(currentNode);
    }

    if (action === 'edit' && currentNode) {
      onEditNode?.(currentNode);
    }

    if (action === 'delete' && currentNode) {
      onDeleteNode?.(currentNode);
    }
  };

  const isLoading = status === 'loading';
  const isError = status === 'error';
  const isEmpty = status === 'success' && treeData.length === 0;

  return (
    <aside className="org-tree-panel" aria-label="Cây mô hình tổ chức">
      <div className="org-tree-header">
        <h2>Dữ liệu</h2>
      </div>

      <div className="org-tree-body">
        {isLoading ? <div className="org-tree-state">Đang tải dữ liệu tổ chức...</div> : null}

        {isError ? (
          <div className="org-tree-state org-tree-state-error">
            <p>Không tải được dữ liệu tổ chức</p>
            <button type="button" onClick={handleRetry} disabled={isRequestingRef.current}>
              Thử lại
            </button>
          </div>
        ) : null}

        {isEmpty ? <div className="org-tree-state">Chưa có dữ liệu tổ chức</div> : null}

        {!isLoading && !isError && treeData.length > 0 ? (
          <ul className="org-tree-list org-tree-root">
            {treeData.map((node) => (
              <TreeNode
                depth={0}
                expandedKeys={expandedKeys}
                key={node.key}
                node={node}
                selectedKey={selectedKey}
                onContextMenu={handleNodeContextMenu}
                onSelect={handleSelect}
                onToggle={handleToggle}
              />
            ))}
          </ul>
        ) : null}

        {contextMenu ? (
          <div
            className="org-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            role="menu"
            aria-label={`Tùy chọn ${contextMenu.title}`}
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" role="menuitem" onClick={() => handleContextAction('create')}>
              Thêm mới
            </button>
            <button type="button" role="menuitem" onClick={() => handleContextAction('edit')}>
              Chỉnh sửa
            </button>
            <button type="button" role="menuitem" onClick={() => handleContextAction('delete')}>
              Xóa
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

export default memo(OrgUnitTree);
