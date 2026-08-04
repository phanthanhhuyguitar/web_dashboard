import { memo, useEffect, useState } from 'react';

import { getTeamLeaderLabel } from '../../utils/teamMetrics.js';
import { formatVndCompact } from '../../utils/formatNumber.js';

export function normalizeSearchText(value) {
  return String(value ?? '').trim().toLowerCase();
}

function RevenueTreeNode({ node, depth, expandedKeys, onToggle }) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedKeys.has(node.key);
  const leaderLabel = node.isTeam ? getTeamLeaderLabel(node) : '';

  return (
    <li className="org-tree-item">
      <div className="org-tree-node org-revenue-tree-node" style={{ '--tree-depth': depth }}>
        <button
          className={`org-tree-toggle${hasChildren ? '' : ' is-empty'}`}
          type="button"
          aria-label={hasChildren ? (isExpanded ? 'Thu gọn đơn vị' : 'Mở rộng đơn vị') : 'Không có đơn vị con'}
          onClick={() => hasChildren && onToggle(node.key)}
        >
          {hasChildren ? (isExpanded ? '-' : '+') : ''}
        </button>

        <div className="org-tree-label org-revenue-tree-label" title={node.code ? `${node.title} - ${node.code}` : node.title}>
          <span className="org-tree-branch" aria-hidden="true" />
          <span className="org-tree-title">{node.title}</span>
          {leaderLabel ? <span className="org-revenue-tree-lead">{leaderLabel}</span> : null}
        </div>

        <strong className="org-revenue-tree-amount">{formatVndCompact(node.disbursementAmount)}</strong>
      </div>

      {hasChildren && isExpanded ? (
        <ul className="org-tree-list">
          {node.children.map((child) => (
            <RevenueTreeNode depth={depth + 1} expandedKeys={expandedKeys} key={child.key} node={child} onToggle={onToggle} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function OrgRevenueTree({ nodes }) {
  const [expandedKeys, setExpandedKeys] = useState(() => new Set(nodes.map((node) => node.key)));

  useEffect(() => {
    setExpandedKeys(new Set(nodes.map((node) => node.key)));
  }, [nodes]);

  const handleToggle = (key) => {
    setExpandedKeys((current) => {
      const next = new Set(current);

      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      return next;
    });
  };

  return (
    <ul className="org-tree-list org-tree-root org-revenue-tree">
      {nodes.map((node) => (
        <RevenueTreeNode depth={0} expandedKeys={expandedKeys} key={node.key} node={node} onToggle={handleToggle} />
      ))}
    </ul>
  );
}

export default memo(OrgRevenueTree);
