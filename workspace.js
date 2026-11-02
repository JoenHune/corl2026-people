(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CORLWorkspace = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STORAGE_KEY = 'corl2026-people-workspace-v1';
  const LEGACY_KEY = 'corl2026-author-saved-v1';
  const MAX_INPUT_BYTES = 5 * 1024 * 1024;
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  const clone = value => JSON.parse(JSON.stringify(value));
  const map = () => Object.create(null);
  const unique = values => Array.from(new Set(values));

  function fail(message) { throw new Error(message); }
  function text(value, label, { empty = true, maximum = 20000 } = {}) {
    if (typeof value !== 'string') fail(label + '必须是文字。');
    const result = value.trim();
    if (!empty && !result) fail(label + '不能为空。');
    if (result.length > maximum) fail(label + '过长，请缩短后重试。');
    return result;
  }
  function strings(value, label) {
    if (!Array.isArray(value)) fail(label + '必须是列表。');
    if (value.length > 20000) fail(label + '条目过多。');
    return unique(value.map(item => text(item, label + '中的条目', { empty: false, maximum: 500 })));
  }
  function parseInput(input) {
    let serialized;
    try { serialized = typeof input === 'string' ? input : JSON.stringify(input); }
    catch (_) { fail('文件内容无法读取，请使用有效的 JSON。'); }
    if (typeof serialized !== 'string') fail('请提供 JSON 对象。');
    const bytes = typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(serialized).length : serialized.length * 2;
    if (bytes > MAX_INPUT_BYTES) fail('文件超过 5 MB，请拆分后导入。');
    let result;
    try { result = JSON.parse(serialized); }
    catch (_) { fail('JSON 格式不正确，请检查文件或粘贴内容。'); }
    if (!object(result)) fail('请提供 JSON 对象，不能是空值或数组。');
    return result;
  }
  function emptyState(dataVersion) {
    return {
      schemaVersion: 1,
      dataVersion,
      mustMeetIds: [],
      groups: [],
      authorNotes: map(),
      nameOverrides: map(),
      recommendations: map()
    };
  }
  function recommendationRecord(row, fallbackSource, fallbackTime) {
    if (!object(row)) fail('推荐记录必须是对象。');
    return {
      reason: text(row.reason, '推荐理由', { maximum: 20000 }),
      paper_ids: strings(row.paper_ids, '支撑论文 ID'),
      group_names: strings(row.group_names, '建议组名').map(name => text(name, '建议组名', { empty: false, maximum: 100 })),
      source: row.source === undefined ? fallbackSource : text(row.source, '推荐来源', { maximum: 1000 }),
      importedAt: row.importedAt === undefined ? fallbackTime : text(row.importedAt, '导入时间', { maximum: 100 })
    };
  }
  function normalizeBackup(input, dataVersion) {
    const raw = parseInput(input);
    if (raw.schemaVersion !== 1) fail('此文件不是支持的个人工作区备份（版本 1）。');
    const output = emptyState(dataVersion);
    output.mustMeetIds = strings(raw.mustMeetIds, '必见名单');
    if (!Array.isArray(raw.groups)) fail('分组必须是列表。');
    if (raw.groups.length > 1000) fail('分组数量过多。');
    const ids = new Set(), names = new Set();
    output.groups = raw.groups.map(group => {
      if (!object(group)) fail('每个分组必须是对象。');
      const id = text(group.id, '分组 ID', { empty: false, maximum: 500 });
      const name = text(group.name, '分组名', { empty: false, maximum: 100 });
      if (ids.has(id) || names.has(name)) fail('备份中的分组 ID 或组名重复，请先合并。');
      ids.add(id); names.add(name);
      return { id, name, note: text(group.note === undefined ? '' : group.note, '分组说明'), members: strings(group.members, '组成员') };
    });
    for (const key of ['authorNotes', 'nameOverrides', 'recommendations']) {
      if (!object(raw[key] === undefined ? {} : raw[key])) fail('备份中的 ' + key + ' 必须是对象。');
    }
    for (const [id, note] of Object.entries(raw.authorNotes || {})) {
      text(id, '作者 ID', { empty: false, maximum: 500 });
      output.authorNotes[id] = text(note, '个人备注');
    }
    for (const [id, match] of Object.entries(raw.nameOverrides || {})) {
      text(id, '作者 ID', { empty: false, maximum: 500 });
      if (typeof match !== 'boolean') fail('姓名风格修正必须是 true 或 false。');
      output.nameOverrides[id] = match;
    }
    for (const [id, records] of Object.entries(raw.recommendations || {})) {
      text(id, '作者 ID', { empty: false, maximum: 500 });
      if (!Array.isArray(records) || records.length > 20000) fail('作者推荐记录必须是列表。');
      output.recommendations[id] = records.map(row => recommendationRecord(row, '', ''));
    }
    return output;
  }
  function recordKey(record) {
    return JSON.stringify([record.reason, record.paper_ids.slice().sort(), record.group_names.slice().sort(), record.source]);
  }
  function newGroupId() {
    const cryptoObject = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
    if (cryptoObject && typeof cryptoObject.randomUUID === 'function') return 'group-' + cryptoObject.randomUUID();
    return 'group-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }

  function create(options = {}) {
    const dataVersion = typeof options.dataVersion === 'string' ? options.dataVersion : '';
    const knownAuthors = new Set(options.knownAuthorIds || []);
    const knownPapers = new Set(options.knownPaperIds || []);
    let authorPapers = null;
    if (options.authorPaperIds !== undefined) {
      if (!(options.authorPaperIds instanceof Map) && !object(options.authorPaperIds)) fail('作者与论文对应表必须是对象或 Map。');
      const entries = options.authorPaperIds instanceof Map ? [...options.authorPaperIds] : Object.entries(options.authorPaperIds);
      authorPapers = new Map(entries.map(([id, ids]) => [text(id, '作者 ID', { empty: false, maximum: 500 }), new Set(strings(ids, '作者的论文 ID'))]));
    }
    let storage = null, storageError = null, undo = null;
    let state = emptyState(dataVersion), newlyCreated = false;
    try {
      storage = own(options, 'storage') ? options.storage : (typeof localStorage !== 'undefined' ? localStorage : null);
      if (storage && (typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function')) {
        storage = null;
        storageError = '浏览器存储不可用，本次修改仅保留在当前页面，请导出备份。';
      }
      const existing = storage ? storage.getItem(STORAGE_KEY) : null;
      if (existing !== null) state = normalizeBackup(existing, dataVersion);
      else {
        newlyCreated = true;
        const legacy = storage ? storage.getItem(options.legacyKey || LEGACY_KEY) : null;
        if (legacy !== null) {
          let ids;
          try { ids = JSON.parse(legacy); }
          catch (_) { fail('旧关注名单无法读取，请保留原页面并导出备份。'); }
          state.mustMeetIds = strings(ids, '旧关注名单');
        }
      }
    } catch (error) {
      storageError = '个人工作区读取失败：' + error.message;
      newlyCreated = false;
      // Do not overwrite an unreadable or newer stored workspace with a blank one.
      storage = null;
    }

    function save() {
      let serialized;
      try { serialized = JSON.stringify(state); }
      catch (_) { storageError = '个人工作区无法保存，请导出备份。'; return false; }
      if (undo && serialized !== undo.after) undo = null;
      if (!storage) {
        storageError = '浏览器存储不可用，本次修改仅保留在当前页面，请导出备份。';
        return false;
      }
      try {
        storage.setItem(STORAGE_KEY, serialized);
        storageError = null;
        return true;
      } catch (_) {
        storageError = '浏览器未能保存个人工作区，本次修改仍保留在页面中，请导出备份。';
        return false;
      }
    }
    function commit() { undo = null; save(); }
    function authorId(id, requireKnown = true) {
      const value = text(id, '作者 ID', { empty: false, maximum: 500 });
      if (requireKnown && !knownAuthors.has(value)) fail('目录中未找到这位作者：' + value);
      return value;
    }
    function authorIds(ids, requireKnown = true) {
      return strings(ids, '作者 ID').map(id => authorId(id, requireKnown));
    }
    function groupById(id) {
      const group = state.groups.find(item => item.id === id);
      if (!group) fail('未找到这个分组。');
      return group;
    }
    function groupName(value, exceptId) {
      const name = text(value, '分组名', { empty: false, maximum: 100 });
      if (state.groups.some(group => group.id !== exceptId && group.name === name)) fail('已有同名分组，请使用其他名称。');
      return name;
    }
    function addGroup(name, note = '') {
      const group = { id: newGroupId(), name, note, members: [] };
      state.groups.push(group);
      return group;
    }
    function appendRecord(id, record) {
      if (!own(state.recommendations, id)) state.recommendations[id] = [];
      const records = state.recommendations[id], key = recordKey(record);
      if (records.some(existing => recordKey(existing) === key)) return false;
      records.push(record);
      return true;
    }
    function referencedIds(snapshot) {
      return unique([
        ...snapshot.mustMeetIds,
        ...snapshot.groups.flatMap(group => group.members),
        ...Object.keys(snapshot.authorNotes),
        ...Object.keys(snapshot.nameOverrides),
        ...Object.keys(snapshot.recommendations)
      ]);
    }
    const controller = {
      get state() { return state; },
      get storageError() { return storageError; },
      save,
      toggleMustMeet(id) {
        const value = authorId(id, false);
        const present = state.mustMeetIds.includes(value);
        if (present) state.mustMeetIds = state.mustMeetIds.filter(item => item !== value);
        else { authorId(value); state.mustMeetIds.push(value); }
        commit();
        return !present;
      },
      setMustMeet(ids, value) {
        if (typeof value !== 'boolean') fail('必见状态必须是 true 或 false。');
        const values = authorIds(ids, value);
        if (value) state.mustMeetIds = unique([...state.mustMeetIds, ...values]);
        else { const remove = new Set(values); state.mustMeetIds = state.mustMeetIds.filter(id => !remove.has(id)); }
        commit();
      },
      createGroup(name, note = '') {
        const cleanName = groupName(name), cleanNote = text(note, '分组说明');
        if (state.groups.length >= 1000) fail('分组已达 1,000 个，请整理后再新建。');
        const group = addGroup(cleanName, cleanNote);
        commit();
        return group;
      },
      renameGroup(id, name) {
        const group = groupById(id), cleanName = groupName(name, id);
        group.name = cleanName;
        commit();
        return group;
      },
      setGroupNote(id, note) {
        const group = groupById(id);
        group.note = text(note, '分组说明');
        commit();
      },
      deleteGroup(id) {
        groupById(id);
        state.groups = state.groups.filter(group => group.id !== id);
        commit();
      },
      addMembers(id, ids) {
        const group = groupById(id), values = authorIds(ids);
        group.members = unique([...group.members, ...values]);
        commit();
        return group;
      },
      removeMember(groupId, id) {
        const group = groupById(groupId), value = authorId(id, false);
        group.members = group.members.filter(item => item !== value);
        commit();
      },
      setAuthorNote(id, note) {
        const value = authorId(id, false), cleanNote = text(note, '个人备注');
        if (cleanNote) state.authorNotes[value] = cleanNote;
        else delete state.authorNotes[value];
        commit();
      },
      setNameOverride(id, match) {
        const value = authorId(id);
        if (match !== null && typeof match !== 'boolean') fail('姓名风格修正必须是 true、false 或 null。');
        if (match === null) delete state.nameOverrides[value];
        else state.nameOverrides[value] = match;
        commit();
      },
      importRecommendations(input) {
        const raw = parseInput(input);
        if (raw.schema_version !== 1 || !Array.isArray(raw.recommendations)) fail('请使用版本 1 的推荐格式，包含 recommendations 列表。');
        if (raw.recommendations.length > 10000) fail('推荐条目过多，请分批导入。');
        const source = raw.source === undefined ? 'Grok Bot' : text(raw.source, '推荐来源', { maximum: 1000 });
        const now = new Date().toISOString();
        // Validate every row before any mutation, including rows for unknown authors.
        const rows = raw.recommendations.map(row => {
          if (!object(row)) fail('每条推荐必须是对象。');
          return { id: authorId(row.author_id, false), record: recommendationRecord(row, source, now) };
        });
        const projectedNames = new Set(state.groups.map(group => group.name));
        for (const row of rows) if (knownAuthors.has(row.id)) for (const name of row.record.group_names) projectedNames.add(name);
        if (projectedNames.size > 1000) fail('导入后的分组将超过 1,000 个，请分批整理。');
        const before = clone(state);
        const report = { added: 0, matchedAuthors: 0, recordsAdded: 0, groups: 0, membershipsAdded: 0, unknownIds: [], invalidPaperIds: [], mismatchedPaperIds: [], mismatchedEvidence: [], duplicates: 0, total: rows.length };
        const touched = new Set();
        undo = null;
        for (const row of rows) {
          if (!knownAuthors.has(row.id)) { report.unknownIds.push(row.id); continue; }
          const validPapers = row.record.paper_ids.filter(id => {
            if (knownPapers.has(id)) {
              if (!authorPapers || authorPapers.get(row.id)?.has(id)) return true;
              report.mismatchedPaperIds.push(id);
              if (!report.mismatchedEvidence.some(item => item.author_id === row.id && item.paper_id === id)) report.mismatchedEvidence.push({ author_id: row.id, paper_id: id });
            }
            report.invalidPaperIds.push(id);
            return false;
          });
          row.record.paper_ids = validPapers;
          const repeated = touched.has(row.id);
          if (repeated) report.duplicates++;
          touched.add(row.id);
          const wasRecommended = own(state.recommendations, row.id) && state.recommendations[row.id].length > 0;
          const didAppend = appendRecord(row.id, row.record);
          if (didAppend) { report.recordsAdded++; if (!wasRecommended) report.added++; }
          else if (!repeated) report.duplicates++;
          for (const name of row.record.group_names) {
            let group = state.groups.find(item => item.name === name);
            if (!group) { group = addGroup(name); report.groups++; }
            if (!group.members.includes(row.id)) { group.members.push(row.id); report.membershipsAdded++; }
          }
        }
        report.unknownIds = unique(report.unknownIds);
        report.invalidPaperIds = unique(report.invalidPaperIds);
        report.mismatchedPaperIds = unique(report.mismatchedPaperIds);
        report.matchedAuthors = touched.size;
        if (JSON.stringify(before) !== JSON.stringify(state)) undo = { before, after: JSON.stringify(state) };
        save();
        return report;
      },
      restoreBackup(input) {
        const incoming = normalizeBackup(input, dataVersion);
        const projectedGroups = state.groups.map(group => ({ id: group.id, name: group.name }));
        for (const group of incoming.groups) if (!projectedGroups.some(existing => existing.id === group.id || existing.name === group.name)) projectedGroups.push(group);
        if (projectedGroups.length > 1000) fail('合并后的分组将超过 1,000 个，请先整理备份。');
        const oldMustMeet = state.mustMeetIds.length;
        const report = { mustMeetAdded: 0, groups: 0, membershipsAdded: 0, notesAdded: 0, recommendationsAdded: 0, unknownIds: referencedIds(incoming).filter(id => !knownAuthors.has(id)) };
        state.mustMeetIds = unique([...state.mustMeetIds, ...incoming.mustMeetIds]);
        report.mustMeetAdded = state.mustMeetIds.length - oldMustMeet;
        for (const incomingGroup of incoming.groups) {
          let group = state.groups.find(item => item.id === incomingGroup.id) || state.groups.find(item => item.name === incomingGroup.name);
          if (!group) {
            group = { ...incomingGroup, members: [] };
            state.groups.push(group);
            report.groups++;
          } else if (!group.note && incomingGroup.note) group.note = incomingGroup.note;
          const size = group.members.length;
          group.members = unique([...group.members, ...incomingGroup.members]);
          report.membershipsAdded += group.members.length - size;
        }
        for (const [id, note] of Object.entries(incoming.authorNotes)) {
          if (!own(state.authorNotes, id) || !state.authorNotes[id]) { state.authorNotes[id] = note; report.notesAdded++; }
        }
        for (const [id, match] of Object.entries(incoming.nameOverrides)) if (!own(state.nameOverrides, id)) state.nameOverrides[id] = match;
        for (const [id, records] of Object.entries(incoming.recommendations)) for (const record of records) if (appendRecord(id, record)) report.recommendationsAdded++;
        commit();
        return report;
      },
      backup() { return clone(state); },
      canUndoImport() { return !!undo && JSON.stringify(state) === undo.after; },
      undoImport() {
        if (!controller.canUndoImport()) { undo = null; return false; }
        state = normalizeBackup(undo.before, dataVersion);
        undo = null;
        save();
        return true;
      }
    };
    if (newlyCreated) save();
    return controller;
  }

  return { create, STORAGE_KEY, LEGACY_KEY, MAX_INPUT_BYTES };
});
