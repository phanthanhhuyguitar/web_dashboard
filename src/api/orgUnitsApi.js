import axiosClient from './axiosClient.js';
import { MAX_PAGES } from '../config/constants.js';
import { ENV } from '../config/env.js';
import { getCache, setCache } from '../utils/cache.js';

const MANAGE_TEAMS_CACHE_KEY = 'tnex_dashboard_manage_teams_cache_v1';
const MANAGE_TEAMS_CACHE_TTL_MS = 10 * 60 * 1000;
const ORG_MANAGE_TYPE = 'ORG_MANAGE';
const LEAD_ROLE_NAME = 'Lead';
const DEFAULT_CONCURRENCY_LIMIT = 5;
const ORG_UNIT_USERS_MAX_PAGES = Math.min(MAX_PAGES, 50);
let orgUnitsListCache = null;
let orgUnitsListInFlight = null;

function getByPath(source, path) {
  return path.split('.').reduce((current, key) => {
    if (current == null) return undefined;
    return current[key];
  }, source);
}

function getFirstValue(source, paths) {
  for (const path of paths) {
    const value = getByPath(source, path);

    if (value !== undefined && value !== null) {
      return value;
    }
  }

  return undefined;
}

function normalizeOrgUnitUsersResponse(responseData) {
  const users =
    getFirstValue(responseData, [
      'data.users',
      'data.content',
      'data.items',
      'data.records',
      'users',
      'content',
      'items',
      'records',
    ]) || [];
  const pagination = getFirstValue(responseData, ['data.pagination', 'pagination']) || {};

  return {
    users: Array.isArray(users) ? users : [],
    pagination: {
      currentPage: Number(pagination?.currentPage) || 0,
      pageSize: Number(pagination?.pageSize) || 20,
      totalElements: Number(pagination?.totalElements) || 0,
      totalPages: Number(pagination?.totalPages) || 0,
    },
  };
}

function normalizeRolesResponse(responseData) {
  const roles =
    getFirstValue(responseData, [
      'data.roles',
      'data.content',
      'data.items',
      'data.records',
      'data',
      'roles',
      'content',
      'items',
      'records',
    ]) || [];

  if (!Array.isArray(roles)) return [];

  return roles
    .map((role) => {
      const id = role?.id ?? role?.roleId;
      const label = role?.roleName || role?.name || role?.code || (id !== undefined && id !== null ? String(id) : '');

      return {
        ...role,
        id,
        label,
      };
    })
    .filter((role) => role.id !== undefined && role.id !== null && String(role.id).trim() !== '');
}

function normalizeSearchUsersResponse(responseData) {
  const users =
    getFirstValue(responseData, [
      'data.users',
      'data.content',
      'data.items',
      'data.records',
      'data',
      'users',
      'content',
      'items',
      'records',
    ]) || [];
  const pagination = getFirstValue(responseData, ['data.pagination', 'pagination']) || {};

  return {
    users: Array.isArray(users) ? users : [],
    pagination: {
      currentPage: Number(pagination?.currentPage) || 0,
      pageSize: Number(pagination?.pageSize) || 5,
      totalElements: Number(pagination?.totalElements) || 0,
      totalPages: Number(pagination?.totalPages) || 0,
    },
  };
}

function getUserIdentity(user) {
  return String(user?.userId ?? user?.id ?? '').trim();
}

function hasMatchingUser(users, userId) {
  const targetUserId = String(userId ?? '').trim();

  if (!targetUserId) return false;

  return users.some((user) => getUserIdentity(user) === targetUserId);
}

function shouldStopPaging({ page, pageSize, totalPages, usersLength }) {
  if (usersLength === 0) return true;
  if (Number.isFinite(Number(totalPages)) && page + 1 >= Number(totalPages)) return true;

  return usersLength < pageSize;
}

function normalizeTeamUser(user) {
  return {
    userId: user?.userId ?? '',
    name: user?.name ?? user?.fullName ?? '',
    phoneNumber: user?.phoneNumber ?? user?.phone ?? '',
    saleId: user?.saleId ?? '',
    roleName: user?.roleName ?? '',
  };
}

export async function fetchOrgUnits() {
  const response = await axiosClient.get(ENV.ORG_UNITS_ENDPOINT);
  const orgUnits = response?.data?.data ?? response?.data ?? [];

  return Array.isArray(orgUnits) ? orgUnits : [];
}

export async function fetchRoles() {
  const response = await axiosClient.get(ENV.ROLES_ENDPOINT);

  return normalizeRolesResponse(response?.data);
}

export async function searchUsers({ searchType, keyword, page = 0, size = 5 }) {
  const trimmedKeyword = String(keyword || '').trim();
  const filter = searchType === 'saleId' ? { saleId: trimmedKeyword } : { phoneNumber: trimmedKeyword };
  const response = await axiosClient.post(ENV.SEARCH_USERS_ENDPOINT, {
    filter,
    page,
    size,
  });

  return normalizeSearchUsersResponse(response?.data);
}

export async function fetchOrganizationUnits({ forceRefresh = false } = {}) {
  if (!forceRefresh && orgUnitsListCache) {
    return orgUnitsListCache;
  }

  if (orgUnitsListInFlight) {
    return orgUnitsListInFlight;
  }

  orgUnitsListInFlight = fetchOrgUnits()
    .then((orgUnits) => {
      orgUnitsListCache = orgUnits;
      return orgUnits;
    })
    .finally(() => {
      orgUnitsListInFlight = null;
    });

  return orgUnitsListInFlight;
}

function toNullableString(value) {
  if (value === undefined || value === null) return null;

  const text = String(value).trim();

  return text || null;
}

function getParentIdFromPath(path) {
  const pathText = toNullableString(path);

  if (!pathText) return null;

  const parts = pathText.split('.').map((item) => item.trim()).filter(Boolean);

  if (parts.length < 2) return null;

  return parts[parts.length - 2];
}

function normalizeOrgUnitNode(orgUnit) {
  const id = toNullableString(orgUnit?.id);

  if (!id) return null;

  const code = toNullableString(orgUnit?.code) || '';
  const name = toNullableString(orgUnit?.name) || '';
  const type = toNullableString(orgUnit?.type) || '';
  const parentId = getParentIdFromPath(orgUnit?.path) || toNullableString(orgUnit?.parentId);
  const title = name || code || `Đơn vị #${id}`;

  return {
    id,
    key: id,
    title,
    name,
    code,
    type,
    path: toNullableString(orgUnit?.path) || '',
    parentId,
    children: [],
  };
}

function sortOrgUnitNodes(nodes) {
  nodes.sort((first, second) => first.title.localeCompare(second.title, 'vi'));
  nodes.forEach((node) => sortOrgUnitNodes(node.children));

  return nodes;
}

export function buildOrgUnitTree(orgUnits) {
  const nodesById = new Map();
  const roots = [];

  if (!Array.isArray(orgUnits)) {
    return roots;
  }

  orgUnits.forEach((orgUnit) => {
    const node = normalizeOrgUnitNode(orgUnit);

    if (node) {
      nodesById.set(node.id, node);
    }
  });

  nodesById.forEach((node) => {
    const parent = node.parentId ? nodesById.get(node.parentId) : null;

    if (parent && parent.id !== node.id) {
      parent.children.push(node);
      return;
    }

    roots.push(node);
  });

  return sortOrgUnitNodes(roots);
}

export function updateOrgUnitNodeInTree(nodes, updatedOrgUnit) {
  const updatedId = toNullableString(updatedOrgUnit?.id);

  if (!updatedId || !Array.isArray(nodes)) {
    return nodes;
  }

  return nodes.map((node) => {
    if (String(node.id) === updatedId) {
      const name = toNullableString(updatedOrgUnit.name) || '';
      const code = toNullableString(updatedOrgUnit.code) || node.code || '';
      const type = toNullableString(updatedOrgUnit.type) || node.type || '';
      const parentId = toNullableString(updatedOrgUnit.parentId) || node.parentId;

      return {
        ...node,
        name,
        title: name || code || `Đơn vị #${node.id}`,
        code,
        type,
        parentId,
      };
    }

    if (Array.isArray(node.children) && node.children.length > 0) {
      return {
        ...node,
        children: updateOrgUnitNodeInTree(node.children, updatedOrgUnit),
      };
    }

    return node;
  });
}

export async function updateOrgUnit(payload) {
  const requestBody = {
    id: payload.id,
    name: payload.name,
    parentId: payload.parentId,
    code: payload.code,
    type: payload.type,
  };

  const response = await axiosClient.put(ENV.ORG_UNITS_ENDPOINT, requestBody);
  const responseData = response?.data?.data ?? response?.data ?? {};
  const updatedOrgUnit = {
    ...requestBody,
    ...(responseData && typeof responseData === 'object' && !Array.isArray(responseData) ? responseData : {}),
  };

  if (orgUnitsListCache) {
    orgUnitsListCache = orgUnitsListCache.map((orgUnit) =>
      String(orgUnit?.id) === String(updatedOrgUnit.id)
        ? {
            ...orgUnit,
            name: updatedOrgUnit.name,
            code: updatedOrgUnit.code,
            type: updatedOrgUnit.type,
            parentId: updatedOrgUnit.parentId,
          }
        : orgUnit
    );
  }

  return updatedOrgUnit;
}

export async function createOrgUnit({ name, parentId, code, type }) {
  const requestBody = {
    name,
    parentId,
    code,
    type,
  };
  const response = await axiosClient.post(ENV.ORG_UNITS_ENDPOINT, requestBody);

  orgUnitsListCache = null;

  return response?.data ?? {};
}

export async function deleteOrgUnit({ id }) {
  const response = await axiosClient.delete(ENV.ORG_UNITS_ENDPOINT, {
    data: { id },
  });

  orgUnitsListCache = null;

  return response?.data ?? {};
}

export async function fetchOrgUnitUsersPage({ orgUnitId, page = 0, size = 50 }) {
  return fetchOrgUnitUsers({
    orgUnitId,
    page,
    size,
  });
}

export async function fetchOrgUnitUsers({
  orgUnitId,
  userId = '',
  saleId = '',
  name = '',
  phone = '',
  roleName = '',
  page = 0,
  size = 20,
}) {
  const response = await axiosClient.post(ENV.ORG_UNIT_USERS_ENDPOINT, {
    filter: {
      orgUnitId,
      userId,
      name,
      phone,
      roleName,
      saleId,
    },
    page,
    size,
  });

  return normalizeOrgUnitUsersResponse(response.data);
}

export async function assignUserToOrgUnit({ orgUnitId, roleId, scope, userId }) {
  const response = await axiosClient.post(ENV.ASSIGN_USER_ROLE_ENDPOINT, {
    orgUnitId,
    roleId,
    scope,
    userId,
  });

  return response?.data ?? {};
}

export async function removeUserFromOrgUnit({ orgUnitId, roleId, userId, scope }) {
  const response = await axiosClient.post(ENV.REMOVE_ORG_UNIT_USER_ENDPOINT, {
    orgUnitId,
    roleId,
    userId,
    scope,
  });

  return response?.data ?? {};
}

export async function checkUserExistsInOrgUnit({ orgUnitId, userId }) {
  const targetUserId = String(userId ?? '').trim();

  if (!orgUnitId || !targetUserId) return false;

  const filteredResult = await fetchOrgUnitUsers({
    orgUnitId,
    userId: targetUserId,
    page: 0,
    size: 100,
  });

  if (hasMatchingUser(filteredResult.users, targetUserId)) {
    return true;
  }

  let page = 0;
  const size = 100;

  while (page < ORG_UNIT_USERS_MAX_PAGES) {
    const { users, pagination } = await fetchOrgUnitUsers({
      orgUnitId,
      page,
      size,
    });

    if (hasMatchingUser(users, targetUserId)) {
      return true;
    }

    if (
      shouldStopPaging({
        page,
        pageSize: size,
        totalPages: pagination?.totalPages,
        usersLength: users.length,
      })
    ) {
      break;
    }

    page += 1;
  }

  return false;
}

export async function hasUsersInOrgUnit(orgUnitId) {
  const { users, pagination } = await fetchOrgUnitUsers({
    orgUnitId,
    page: 0,
    size: 1,
  });

  return Number(pagination?.totalElements || 0) > 0 || users.length > 0;
}

export async function fetchAllOrgUnitUsers({ orgUnitId, size = 50 }) {
  const allUsers = [];
  let page = 0;

  while (page < ORG_UNIT_USERS_MAX_PAGES) {
    const { users, pagination } = await fetchOrgUnitUsersPage({
      orgUnitId,
      page,
      size,
    });

    allUsers.push(...users);

    if (
      shouldStopPaging({
        page,
        pageSize: size,
        totalPages: pagination?.totalPages,
        usersLength: users.length,
      })
    ) {
      break;
    }

    page += 1;
  }

  return allUsers;
}

export async function runWithConcurrency(items, limit = DEFAULT_CONCURRENCY_LIMIT, taskFn) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await taskFn(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(Math.max(Number(limit) || DEFAULT_CONCURRENCY_LIMIT, 1), items.length);
  const workers = Array.from({ length: workerCount }, () => worker());

  await Promise.all(workers);

  return results;
}

export async function fetchManageTeamsWithUsers({ useCache = true } = {}) {
  if (useCache) {
    const cachedTeams = getCache(MANAGE_TEAMS_CACHE_KEY);

    if (cachedTeams) return cachedTeams;
  }

  const orgUnits = await fetchOrgUnits();
  const manageOrgUnits = orgUnits.filter((org) => org?.type === ORG_MANAGE_TYPE);
  const teams = await runWithConcurrency(manageOrgUnits, DEFAULT_CONCURRENCY_LIMIT, async (org) => {
    const users = (await fetchAllOrgUnitUsers({ orgUnitId: org.id })).map(normalizeTeamUser);
    const lead = users.find((user) => user.roleName === LEAD_ROLE_NAME);

    if (!lead) return null;

    return {
      orgUnitId: org.id,
      teamName: org.name ?? '',
      teamCode: org.code ?? '',
      parentId: org.parentId ?? null,
      path: org.path ?? '',
      lead,
      users,
    };
  });
  const validTeams = teams.filter(Boolean);

  setCache(MANAGE_TEAMS_CACHE_KEY, validTeams, MANAGE_TEAMS_CACHE_TTL_MS);

  return validTeams;
}
