import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  Layout,
  Settings,
  Plus,
  Trash2,
  RefreshCw,
  Move,
  Check,
  X,
  Heart,
  Mail,
  Save,
  FolderDown,
  Upload
} from 'lucide-react';

import {
  deleteBackupRecord,
  getBackupStorageKind,
  getBackupRecord,
  listBackups,
  saveBackupRecord
} from './backupStorage.js';

// --- Constants & Types ---

const ZONES = {
  GREEN: { id: 'green', color: 'bg-green-200 border-green-400', label: 'קרוב ללוח' },
  ORANGE: { id: 'orange', color: 'bg-orange-200 border-orange-400', label: 'אזור ביניים' },
  RED: { id: 'red', color: 'bg-red-200 border-red-400', label: 'רחוק מהלוח' }
};

const INITIAL_DESKS_COUNT = 20;

const COLORS = [
  'bg-blue-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-indigo-500',
  'bg-teal-500',
  'bg-yellow-500',
  'bg-cyan-500',
  'bg-rose-500'
];

// --- Helper Functions ---

const generateId = () => Math.random().toString(36).substr(2, 9);

// Initial Mock Data
const INITIAL_STUDENTS = [
  { id: 's1', name: 'דני', traits: [] },
  { id: 's2', name: 'יוסי', traits: [] },
  { id: 's3', name: 'רונה', traits: [] },
  { id: 's4', name: 'מיכל', traits: [] },
  { id: 's5', name: 'נועה', traits: [] },
  { id: 's6', name: 'גל', traits: [] },
  { id: 's7', name: 'עומר', traits: [] },
  { id: 's8', name: 'טל', traits: [] }
];

const INITIAL_TRAITS = [
  {
    id: 't1',
    name: 'ראייה לקויה',
    color: 'bg-blue-500',
    rules: [{ operator: 'AND', type: 'zone', condition: 'must', target: 'green' }]
  },
  {
    id: 't2',
    name: 'גבוה',
    color: 'bg-purple-500',
    rules: [{ operator: 'AND', type: 'zone', condition: 'prefer', target: 'red' }]
  },
  { id: 't3', name: 'פטפטן', color: 'bg-yellow-500', rules: [] }
];

// --- Sub-Components ---

// Isolated component for adding rules to prevent state leakage between traits
const RuleBuilder = ({ traitId, traits, onAddRule }) => {
  const [condition, setCondition] = useState('must');
  const [ruleType, setRuleType] = useState('zone');
  const [ruleTarget, setRuleTarget] = useState('green');
  const [operator, setOperator] = useState('AND');

  const handleAdd = () => {
    onAddRule(traitId, { operator, type: ruleType, condition, target: ruleTarget });
  };

  return (
    <div className="bg-blue-50 p-2 rounded text-sm mt-2">
      <div className="flex flex-wrap gap-2 items-center">
        <span className="font-bold text-blue-800">הוסף חוק:</span>

        {/* Operator Selector (Only relevant if there are existing rules, but kept for consistency) */}
        <select
          value={operator}
          onChange={e => setOperator(e.target.value)}
          className="border rounded p-1 text-xs"
        >
          <option value="AND">וגם</option>
          <option value="OR">או</option>
        </select>

        <select
          value={condition}
          onChange={e => setCondition(e.target.value)}
          className="border rounded p-1 text-xs"
        >
          <option value="must">חייב</option>
          <option value="prefer">רצוי</option>
          <option value="must_not">חייב שלא</option>
          <option value="prefer_not">רצוי שלא</option>
        </select>

        <span>להיות</span>

        <select
          value={ruleType}
          onChange={e => {
            setRuleType(e.target.value);
            setRuleTarget(e.target.value === 'zone' ? 'green' : traits[0]?.id || '');
          }}
          className="border rounded p-1 text-xs"
        >
          <option value="zone">באזור</option>
          <option value="peer">ליד תלמיד עם</option>
        </select>

        <select
          value={ruleTarget}
          onChange={e => setRuleTarget(e.target.value)}
          className="border rounded p-1 flex-1 text-xs min-w-[80px]"
        >
          {ruleType === 'zone' ? (
            Object.values(ZONES).map(z => (
              <option key={z.id} value={z.id}>
                {z.label}
              </option>
            ))
          ) : (
            traits.map(tr => (
              <option key={tr.id} value={tr.id}>
                {tr.name}
              </option>
            ))
          )}
        </select>

        <button
          onClick={handleAdd}
          className="bg-blue-600 hover:bg-blue-700 text-white p-1.5 rounded transition-colors"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
};

// --- Main Component ---

export default function App() {
  const [activeTab, setActiveTab] = useState('layout');

  // Data State
  const [desks, setDesks] = useState([]);
  const [students, setStudents] = useState(INITIAL_STUDENTS);
  const [traits, setTraits] = useState(INITIAL_TRAITS);
  const [seatingMap, setSeatingMap] = useState({});

  // UI State
  const [selectedZoneTool, setSelectedZoneTool] = useState(null); // 'green', 'orange', 'red', 'delete'
  const [isDraggingDesk, setIsDraggingDesk] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [selectedStudentForSwap, setSelectedStudentForSwap] = useState(null);
  const [notification, setNotification] = useState(null);

  // Backup/Restore UI State
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [backupNameDraft, setBackupNameDraft] = useState('');
  const [backups, setBackups] = useState([]);
  const [backupStorageKind, setBackupStorageKind] = useState(getBackupStorageKind());
  const [isBackupsLoading, setIsBackupsLoading] = useState(false);

  const containerRef = useRef(null);

  // Initialize Desks
  useEffect(() => {
    const newDesks = [];
    const rows = 5;
    const cols = 4;
    for (let i = 0; i < INITIAL_DESKS_COUNT; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      let zone = 'orange';
      if (row < 2) zone = 'green';
      if (row >= 3) zone = 'red';

      newDesks.push({
        id: generateId(),
        x: 50 + col * 160,
        y: 80 + row * 120,
        zone
      });
    }
    setDesks(newDesks);
  }, []);

  const getSnapshot = () => ({
    students,
    traits,
    desks,
    seatingMap
  });

  const applySnapshot = snapshot => {
    if (!snapshot || typeof snapshot !== 'object') return false;
    const nextStudents = Array.isArray(snapshot.students) ? snapshot.students : null;
    const nextTraits = Array.isArray(snapshot.traits) ? snapshot.traits : null;
    const nextDesks = Array.isArray(snapshot.desks) ? snapshot.desks : null;
    const nextSeatingMap = snapshot.seatingMap && typeof snapshot.seatingMap === 'object' ? snapshot.seatingMap : null;

    if (!nextStudents || !nextTraits || !nextDesks || !nextSeatingMap) return false;

    setStudents(nextStudents);
    setTraits(nextTraits);
    setDesks(nextDesks);
    setSeatingMap(nextSeatingMap);

    // Reset transient UI bits
    setSelectedZoneTool(null);
    setIsDraggingDesk(null);
    setSelectedStudentForSwap(null);
    return true;
  };

  const refreshBackups = async () => {
    setIsBackupsLoading(true);
    try {
      setBackupStorageKind(getBackupStorageKind());
      const items = await listBackups();
      setBackups(items);
    } finally {
      setIsBackupsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'backup') {
      void refreshBackups();
    }
  }, [activeTab]);

  const openSaveModal = () => {
    setBackupNameDraft('');
    setIsSaveModalOpen(true);
  };

  const openRestoreModal = async () => {
    await refreshBackups();
    setIsRestoreModalOpen(true);
  };

  const closeModals = () => {
    setIsSaveModalOpen(false);
    setIsRestoreModalOpen(false);
  };

  const notify = msg => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleSaveBackup = async () => {
    const name = backupNameDraft.trim();
    if (!name) return;

    const existing = await getBackupRecord(name);
    if (existing) {
      const ok = globalThis.confirm?.('כבר קיים גיבוי בשם הזה. להחליף?') ?? true;
      if (!ok) return;
    }

    await saveBackupRecord(name, getSnapshot());
    await refreshBackups();
    closeModals();
    notify(`נשמר גיבוי "${name}" (${backupStorageKind === 'sync' ? 'Sync' : 'Local'})`);
  };

  const handleRestoreBackupByName = async name => {
    const record = await getBackupRecord(name);
    const payload = record?.payload ?? null;
    const ok = applySnapshot(payload);
    if (!ok) {
      notify('שחזור נכשל: קובץ/גיבוי לא תקין');
      return;
    }
    closeModals();
    notify(`שוחזר "${name}"`);
  };

  const downloadJson = (filename, obj) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const importFromFile = async file => {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const payload = parsed?.payload ?? parsed?.data ?? parsed;

    const candidateName =
      (typeof parsed?.name === 'string' && parsed.name.trim()) ||
      (typeof file?.name === 'string' ? file.name.replace(/\.json$/i, '') : '');

    const name = (globalThis.prompt?.('שם לגיבוי (לשמירה ב-Storage):', candidateName) ?? candidateName).trim();
    if (!name) return;

    const existing = await getBackupRecord(name);
    if (existing) {
      const ok = globalThis.confirm?.('כבר קיים גיבוי בשם הזה. להחליף?') ?? true;
      if (!ok) return;
    }

    // Save and optionally restore
    await saveBackupRecord(name, payload);
    await refreshBackups();
    const restoreNow = globalThis.confirm?.('הקובץ נטען ונשמר. לשחזר עכשיו?') ?? true;
    if (restoreNow) {
      const ok = applySnapshot(payload);
      if (ok) notify(`שוחזר "${name}"`);
      else notify('שחזור נכשל: קובץ/גיבוי לא תקין');
    } else {
      notify(`נטען ונשמר "${name}"`);
    }
  };

  // --- Logic: Layout Panel ---

  const handleDeskPointerDown = (e, deskId) => {
    // Prevent touch scrolling while dragging
    e.preventDefault?.();

    if (selectedZoneTool) {
      if (selectedZoneTool === 'delete') {
        setDesks(desks.filter(d => d.id !== deskId));
        const newMap = { ...seatingMap };
        delete newMap[`${deskId}-0`];
        delete newMap[`${deskId}-1`];
        setSeatingMap(newMap);
      } else {
        setDesks(desks.map(d => (d.id === deskId ? { ...d, zone: selectedZoneTool } : d)));
      }
      return;
    }

    const desk = desks.find(d => d.id === deskId);
    if (!containerRef.current || !desk) return;

    // Capture the pointer so we keep getting move events
    try {
      containerRef.current.setPointerCapture?.(e.pointerId);
    } catch {
      // no-op
    }

    const rect = containerRef.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left - desk.x;
    const offsetY = e.clientY - rect.top - desk.y;

    setIsDraggingDesk(deskId);
    setDragOffset({ x: offsetX, y: offsetY });
  };

  const handlePointerMove = e => {
    if (isDraggingDesk && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - dragOffset.x;
      const y = e.clientY - rect.top - dragOffset.y;
      setDesks(prev => prev.map(d => (d.id === isDraggingDesk ? { ...d, x, y } : d)));
    }
  };

  const handlePointerUp = e => {
    try {
      containerRef.current?.releasePointerCapture?.(e.pointerId);
    } catch {
      // no-op
    }
    setIsDraggingDesk(null);
  };

  const addDesk = () => {
    setDesks([...desks, { id: generateId(), x: 50, y: 50, zone: 'orange' }]);
  };

  // --- Logic: Seating Algorithm (Updated with AND/OR) ---

  const calculateScore = currentMap => {
    let totalScore = 0;
    const penalty = { must: 1000, prefer: 100 };

    // Helper to check a single rule
    const checkRule = (rule, desk, student, neighbor) => {
      void student;
      let isViolation = false;
      let rulePenalty = 0;

      if (rule.type === 'zone') {
        const isMatch = desk.zone === rule.target;
        if (rule.condition === 'must' && !isMatch) isViolation = true;
        if (rule.condition === 'prefer' && !isMatch) isViolation = true;
        if (rule.condition === 'must_not' && isMatch) isViolation = true;
        if (rule.condition === 'prefer_not' && isMatch) isViolation = true;
      }

      if (rule.type === 'peer') {
        const hasTargetTrait = neighbor?.traits.includes(rule.target);
        if (rule.condition === 'must' && !hasTargetTrait) isViolation = true;
        if (rule.condition === 'prefer' && !hasTargetTrait) isViolation = true;
        if (rule.condition === 'must_not' && hasTargetTrait) isViolation = true;
        if (rule.condition === 'prefer_not' && hasTargetTrait) isViolation = true;
      }

      if (isViolation) {
        rulePenalty = rule.condition.includes('must') ? penalty.must : penalty.prefer;
      }
      return rulePenalty;
    };

    Object.entries(currentMap).forEach(([seatKey, studentId]) => {
      const [deskId, seatIdx] = seatKey.split('-');
      const desk = desks.find(d => d.id === deskId);
      const student = students.find(s => s.id === studentId);

      if (!desk || !student) return;

      const neighborSeatIdx = seatIdx === '0' ? '1' : '0';
      const neighborId = currentMap[`${deskId}-${neighborSeatIdx}`];
      const neighbor = students.find(s => s.id === neighborId);

      // Check traits
      student.traits.forEach(traitId => {
        const trait = traits.find(t => t.id === traitId);
        if (!trait || trait.rules.length === 0) return;

        // Group rules by 'OR'.
        // Example: (Rule A AND Rule B) OR (Rule C).
        // If (A & B) is fine -> Score 0. If not, check C.
        // We take the MINIMUM penalty among the OR groups.

        const ruleGroups = [];
        let currentGroup = [];

        trait.rules.forEach((rule, index) => {
          if (index === 0) {
            currentGroup.push(rule);
          } else {
            if (rule.operator === 'OR') {
              ruleGroups.push(currentGroup);
              currentGroup = [rule];
            } else {
              currentGroup.push(rule);
            }
          }
        });
        ruleGroups.push(currentGroup);

        // Calculate penalty for each group
        const groupPenalties = ruleGroups.map(group => {
          return group.reduce((sum, rule) => sum + checkRule(rule, desk, student, neighbor), 0);
        });

        // The student satisfies the trait if ANY group is satisfied (min penalty)
        totalScore += Math.min(...groupPenalties);
      });
    });
    return totalScore;
  };

  const arrangeSeating = () => {
    let map = {};
    const seats = [];
    desks.forEach(d => {
      seats.push(`${d.id}-0`);
      seats.push(`${d.id}-1`);
    });

    const shuffledStudents = [...students].sort(() => Math.random() - 0.5);
    shuffledStudents.forEach((s, i) => {
      if (i < seats.length) {
        map[seats[i]] = s.id;
      }
    });

    let currentScore = calculateScore(map);

    // Simple Simulated Annealing
    const iterations = 2500;
    for (let i = 0; i < iterations; i++) {
      const idx1 = Math.floor(Math.random() * seats.length);
      const idx2 = Math.floor(Math.random() * seats.length);
      const key1 = seats[idx1];
      const key2 = seats[idx2];

      const testMap = { ...map };
      const s1 = testMap[key1];
      const s2 = testMap[key2];

      testMap[key1] = s2;
      testMap[key2] = s1;

      if (s1 === undefined && s2 === undefined) continue;

      const newScore = calculateScore(testMap);

      // Accept improvement or occasionally accept degradation (not implemented fully for speed)
      if (newScore <= currentScore) {
        map = testMap;
        currentScore = newScore;
      }
    }

    Object.keys(map).forEach(key => map[key] === undefined && delete map[key]);

    setSeatingMap(map);
    notify('השיבוץ הושלם בהצלחה!');
  };

  const handleSeatClick = (deskId, seatIdx) => {
    const key = `${deskId}-${seatIdx}`;

    if (!selectedStudentForSwap) {
      if (seatingMap[key]) {
        setSelectedStudentForSwap(key);
      }
    } else {
      const sourceKey = selectedStudentForSwap;
      const targetKey = key;

      const newMap = { ...seatingMap };
      const sourceStudent = newMap[sourceKey];
      const targetStudent = newMap[targetKey];

      newMap[targetKey] = sourceStudent;
      if (targetStudent) {
        newMap[sourceKey] = targetStudent;
      } else {
        delete newMap[sourceKey];
      }

      setSeatingMap(newMap);
      setSelectedStudentForSwap(null);
    }
  };

  // --- Main Render Components ---

  const Desk = ({ desk }) => {
    const zone = ZONES[desk.zone.toUpperCase()];
    const zoneStyle = zone?.color || 'bg-gray-200 border-gray-400';

    return (
      <div
        onPointerDown={e => handleDeskPointerDown(e, desk.id)}
        className={`absolute w-32 h-20 border-2 rounded-lg flex flex-col items-center justify-center cursor-move shadow-md transition-colors touch-none select-none ${zoneStyle}`}
        style={{ left: desk.x, top: desk.y }}
      >
        <div className="absolute -top-6 text-xs font-bold text-gray-500 bg-white/80 px-1 rounded">
          {zone?.label ?? desk.zone}
        </div>

        <div className="flex w-full h-full">
          {[0, 1].map(idx => {
            const studentId = seatingMap[`${desk.id}-${idx}`];
            const student = students.find(s => s.id === studentId);
            const isSelected = selectedStudentForSwap === `${desk.id}-${idx}`;

            return (
              <div
                key={idx}
                onClick={e => {
                  e.stopPropagation();
                  handleSeatClick(desk.id, idx);
                }}
                className={`flex-1 m-1 rounded border border-dashed border-gray-400 flex items-center justify-center cursor-pointer relative group
                  ${isSelected ? 'bg-blue-100 ring-2 ring-blue-500' : 'hover:bg-white/40'}
                `}
              >
                {student ? (
                  <>
                    <div className="text-center">
                      <div className="font-bold text-sm text-gray-800">{student.name}</div>
                    </div>
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-2 hidden group-hover:block z-50 w-48 bg-gray-800 text-white text-xs rounded p-2 pointer-events-none shadow-xl">
                      <div className="font-bold mb-1 border-b pb-1">מאפיינים:</div>
                      {student.traits.length === 0
                        ? 'אין'
                        : student.traits.map(tid => {
                            const t = traits.find(tr => tr.id === tid);
                            return (
                              <div key={tid} className="flex items-center gap-1 mb-1">
                                <span className={`w-2 h-2 rounded-full ${t?.color}`}></span>
                                {t?.name}
                              </div>
                            );
                          })}
                    </div>
                  </>
                ) : (
                  <span className="text-gray-400 text-xs">פנוי</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const RosterPanel = () => {
    const [newName, setNewName] = useState('');

    const addStudent = () => {
      if (!newName.trim()) return;
      setStudents([...students, { id: generateId(), name: newName, traits: [] }]);
      setNewName('');
    };

    const toggleTrait = (studentId, traitId) => {
      setStudents(
        students.map(s => {
          if (s.id !== studentId) return s;
          const hasTrait = s.traits.includes(traitId);
          return {
            ...s,
            traits: hasTrait ? s.traits.filter(t => t !== traitId) : [...s.traits, traitId]
          };
        })
      );
    };

    return (
      <div className="p-4 bg-white rounded-lg shadow h-full overflow-y-auto">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Users size={20} /> רשימת תלמידים
        </h2>

        <div className="flex gap-2 mb-6">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="שם תלמיד חדש..."
            className="flex-1 p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            onKeyDown={e => e.key === 'Enter' && addStudent()}
          />
          <button onClick={addStudent} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
            הוסף
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b">
                <th className="p-3">שם</th>
                <th className="p-3">מאפיינים ומגבלות</th>
                <th className="p-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {students.map(s => (
                <tr key={s.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 font-medium">{s.name}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      {traits.map(t => (
                        <button
                          key={t.id}
                          onClick={() => toggleTrait(s.id, t.id)}
                          className={`px-2 py-1 rounded text-xs border transition-colors flex items-center gap-1
                            ${
                              s.traits.includes(t.id)
                                ? `${t.color} text-white border-transparent`
                                : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                            }`}
                        >
                          {s.traits.includes(t.id) && <Check size={10} />}
                          {t.name}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => setStudents(students.filter(st => st.id !== s.id))}
                      className="text-red-400 hover:text-red-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const ConstraintsPanel = () => {
    const [newTraitName, setNewTraitName] = useState('');
    const [selectedColor, setSelectedColor] = useState(COLORS[0]);

    const addTrait = () => {
      if (!newTraitName.trim()) return;
      setTraits([...traits, { id: generateId(), name: newTraitName, color: selectedColor, rules: [] }]);
      setNewTraitName('');
    };

    const addRuleToTrait = (traitId, ruleData) => {
      setTraits(
        traits.map(t => {
          if (t.id !== traitId) return t;
          // If it's the first rule, operator is effectively 'AND' for data consistency
          const newRule = { ...ruleData, operator: t.rules.length === 0 ? 'AND' : ruleData.operator };
          return {
            ...t,
            rules: [...t.rules, newRule]
          };
        })
      );
    };

    const removeRule = (traitId, ruleIndex) => {
      setTraits(
        traits.map(t => {
          if (t.id !== traitId) return t;
          const newRules = [...t.rules];
          newRules.splice(ruleIndex, 1);
          // Reset first rule operator to AND if needed, though not strictly critical
          if (newRules.length > 0) newRules[0].operator = 'AND';
          return { ...t, rules: newRules };
        })
      );
    };

    return (
      <div className="p-4 bg-white rounded-lg shadow h-full overflow-y-auto">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Settings size={20} /> הגדרת חוקים ומאפיינים
        </h2>

        <div className="bg-gray-50 p-4 rounded-lg mb-6 border">
          <h3 className="font-bold mb-2">יצירת מאפיין חדש</h3>
          <div className="flex gap-2 items-center mb-3">
            <input
              value={newTraitName}
              onChange={e => setNewTraitName(e.target.value)}
              placeholder="שם המאפיין (למשל: לא רואה טוב)"
              className="flex-1 p-2 border rounded"
            />
            <div className="flex gap-1">
              {COLORS.map(c => (
                <div
                  key={c}
                  onClick={() => setSelectedColor(c)}
                  className={`w-6 h-6 rounded-full cursor-pointer ${c} ${
                    selectedColor === c ? 'ring-2 ring-offset-1 ring-gray-600' : ''
                  }`}
                />
              ))}
            </div>
            <button onClick={addTrait} className="bg-blue-600 text-white px-4 py-2 rounded">
              צור
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {traits.map(t => (
            <div key={t.id} className="border rounded-lg p-3 bg-white shadow-sm">
              <div className="flex justify-between items-center mb-2 border-b pb-2">
                <div className="flex items-center gap-2">
                  <span className={`w-4 h-4 rounded-full ${t.color}`}></span>
                  <span className="font-bold text-lg">{t.name}</span>
                </div>
                <button
                  onClick={() => setTraits(traits.filter(tr => tr.id !== t.id))}
                  className="text-red-400 hover:text-red-600"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              {/* Rules List */}
              <div className="space-y-2 mb-3">
                {t.rules.length === 0 && <p className="text-gray-400 text-sm italic">אין חוקים מוגדרים למאפיין זה</p>}
                {t.rules.map((r, idx) => {
                  let desc = '';
                  const condText = r.condition.includes('must') ? 'חייב' : 'רצוי';
                  const negText = r.condition.includes('not') ? 'שלא' : '';

                  if (r.type === 'zone') {
                    const zoneLabel = Object.values(ZONES).find(z => z.id === r.target)?.label;
                    desc = `${condText} ${negText} לשבת ב${zoneLabel}`;
                  } else {
                    const targetName = traits.find(tr => tr.id === r.target)?.name;
                    desc = `${condText} ${negText} לשבת ליד ${targetName}`;
                  }

                  return (
                    <div key={idx} className="flex items-center gap-2">
                      {idx > 0 && (
                        <span
                          className={`text-xs font-bold px-1 rounded ${
                            r.operator === 'OR' ? 'bg-orange-100 text-orange-700' : 'bg-gray-200 text-gray-600'
                          }`}
                        >
                          {r.operator === 'OR' ? 'או' : 'וגם'}
                        </span>
                      )}
                      <div className="flex flex-1 justify-between items-center bg-gray-50 px-2 py-1 rounded text-sm border">
                        <span>{desc}</span>
                        <button
                          onClick={() => removeRule(t.id, idx)}
                          className="text-red-400 hover:bg-red-50 rounded p-0.5"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add Rule Form Component */}
              <RuleBuilder traitId={t.id} traits={traits} onAddRule={addRuleToTrait} />
            </div>
          ))}
        </div>
      </div>
    );
  };

  const BackupPanel = () => {
    const fileInputRef = useRef(null);

    const handlePickFile = () => {
      fileInputRef.current?.click();
    };

    const handleFileChange = async e => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        await importFromFile(file);
      } catch {
        notify('טעינת קובץ נכשלה: JSON לא תקין');
      }
    };

    const formatDate = iso => {
      if (!iso) return '';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return d.toLocaleString('he-IL');
    };

    return (
      <div className="p-4 bg-white rounded-lg shadow h-full overflow-y-auto">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <FolderDown size={20} /> גיבוי ושחזור
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              אחסון: <span className="font-bold">{backupStorageKind === 'sync' ? 'Sync Storage' : 'Local Storage'}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void refreshBackups()}
              className="bg-white border hover:bg-gray-50 px-3 py-2 rounded text-sm"
            >
              רענן רשימה
            </button>
            <button onClick={openSaveModal} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm">
              שמור מצב נוכחי
            </button>
          </div>
        </div>

        <div className="bg-gray-50 border rounded-lg p-3 mb-4 flex items-center justify-between gap-3">
          <div className="text-sm text-gray-700">
            <div className="font-bold">ייבוא/ייצוא</div>
            <div className="text-gray-500">טען קובץ JSON לגיבויים (ואפשר לשחזר מיד)</div>
          </div>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              onClick={handlePickFile}
              className="bg-white border hover:bg-gray-100 px-3 py-2 rounded text-sm flex items-center gap-2"
            >
              <Upload size={16} /> טען קובץ
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-gray-700">כיתות שמורות</h3>
          <span className="text-xs text-gray-400">{isBackupsLoading ? 'טוען…' : `${backups.length} פריטים`}</span>
        </div>

        <div className="space-y-2">
          {backups.length === 0 && (
            <div className="text-gray-400 text-sm italic border rounded p-4 bg-white">אין עדיין גיבויים שמורים.</div>
          )}

          {backups.map(b => (
            <div key={b.key} className="border rounded-lg p-3 bg-white flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-bold truncate">{b.name}</div>
                <div className="text-xs text-gray-500">נשמר: {formatDate(b.savedAt)}</div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => void handleRestoreBackupByName(b.name)}
                  className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded text-sm"
                >
                  שחזר
                </button>
                <button
                  onClick={async () => {
                    const record = await getBackupRecord(b.name);
                    if (!record) return;
                    downloadJson(`${b.name}.json`, record);
                  }}
                  className="bg-white border hover:bg-gray-50 px-3 py-2 rounded text-sm"
                >
                  הורד לקובץ
                </button>
                <button
                  onClick={async () => {
                    const ok = globalThis.confirm?.(`למחוק את "${b.name}"?`) ?? true;
                    if (!ok) return;
                    await deleteBackupRecord(b.name);
                    await refreshBackups();
                    notify(`נמחק "${b.name}"`);
                  }}
                  className="bg-white border hover:bg-red-50 px-3 py-2 rounded text-sm text-red-600"
                >
                  מחק
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen w-full bg-gray-100 text-gray-800 flex flex-col font-sans" dir="rtl">
      {/* Header */}
      <header className="bg-white shadow-sm p-3 md:p-4 flex flex-col md:flex-row md:justify-between md:items-center z-20 gap-2">
        <h1 className="text-2xl font-bold text-blue-800 flex items-center gap-2">
          <Layout className="text-blue-600" /> SmartClass
        </h1>
        <div className="flex gap-2 md:gap-4 flex-wrap justify-start md:justify-end">
          <button
            onClick={arrangeSeating}
            className="bg-green-600 hover:bg-green-700 text-white px-4 md:px-6 py-2 rounded-lg font-bold shadow flex items-center gap-2 transition-transform active:scale-95 text-sm md:text-base"
          >
            <RefreshCw size={18} className="md:w-5 md:h-5" /> <span className="hidden sm:inline">סדר כיתה</span>
          </button>
          <button
            onClick={openSaveModal}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 md:px-6 py-2 rounded-lg font-bold shadow flex items-center gap-2 transition-transform active:scale-95 text-sm md:text-base"
          >
            <Save size={18} className="md:w-5 md:h-5" /> <span className="hidden sm:inline">שמור</span>
          </button>
          <button
            onClick={() => void openRestoreModal()}
            className="bg-white hover:bg-gray-50 border px-4 md:px-6 py-2 rounded-lg font-bold shadow flex items-center gap-2 transition-transform active:scale-95 text-sm md:text-base"
          >
            <FolderDown size={18} className="md:w-5 md:h-5" /> <span className="hidden sm:inline">שחזור</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Tabs */}
        <nav className="hidden md:flex w-72 bg-white border-l shadow-lg flex-col z-10 flex-shrink-0">
          <button
            onClick={() => setActiveTab('layout')}
            className={`p-4 text-right hover:bg-gray-50 transition-colors flex items-center gap-3 border-b ${
              activeTab === 'layout' ? 'bg-blue-50 border-r-4 border-r-blue-600 text-blue-700 font-bold' : ''
            }`}
          >
            <Layout size={20} /> הושבה ומבנה
          </button>
          <button
            onClick={() => setActiveTab('constraints')}
            className={`p-4 text-right hover:bg-gray-50 transition-colors flex items-center gap-3 border-b ${
              activeTab === 'constraints'
                ? 'bg-blue-50 border-r-4 border-r-blue-600 text-blue-700 font-bold'
                : ''
            }`}
          >
            <Settings size={20} /> מאפיינים ומגבלות
          </button>
          <button
            onClick={() => setActiveTab('roster')}
            className={`p-4 text-right hover:bg-gray-50 transition-colors flex items-center gap-3 border-b ${
              activeTab === 'roster' ? 'bg-blue-50 border-r-4 border-r-blue-600 text-blue-700 font-bold' : ''
            }`}
          >
            <Users size={20} /> רשימת כיתה
          </button>

          <button
            onClick={() => setActiveTab('backup')}
            className={`p-4 text-right hover:bg-gray-50 transition-colors flex items-center gap-3 border-b ${
              activeTab === 'backup' ? 'bg-blue-50 border-r-4 border-r-blue-600 text-blue-700 font-bold' : ''
            }`}
          >
            <FolderDown size={20} /> גיבוי ושחזור
          </button>

          {activeTab === 'layout' && (
            <div className="p-4 mt-auto border-t bg-gray-50">
              <h3 className="text-sm font-bold text-gray-500 mb-2">כלים:</h3>
              <div className="grid grid-cols-2 gap-2 mb-4">
                <button
                  onClick={addDesk}
                  className="bg-white border hover:bg-gray-100 p-2 rounded flex items-center justify-center gap-2 text-sm"
                >
                  <Plus size={16} /> הוסף
                </button>
                <button
                  onClick={() => setSelectedZoneTool(selectedZoneTool === 'delete' ? null : 'delete')}
                  className={`bg-white border hover:bg-red-50 p-2 rounded flex items-center justify-center gap-2 text-sm text-red-600 ${
                    selectedZoneTool === 'delete' ? 'ring-2 ring-red-500 bg-red-50' : ''
                  }`}
                >
                  <Trash2 size={16} /> מחק
                </button>
              </div>

              <h3 className="text-sm font-bold text-gray-500 mb-2">אזורים:</h3>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setSelectedZoneTool(selectedZoneTool === 'green' ? null : 'green')}
                  className={`p-2 rounded border text-sm flex flex-col items-center ${
                    selectedZoneTool === 'green' ? 'ring-2 ring-green-500 bg-green-50' : 'bg-white'
                  }`}
                >
                  <div className="w-4 h-4 rounded bg-green-200 border border-green-400 mb-1"></div> קרוב
                </button>
                <button
                  onClick={() => setSelectedZoneTool(selectedZoneTool === 'orange' ? null : 'orange')}
                  className={`p-2 rounded border text-sm flex flex-col items-center ${
                    selectedZoneTool === 'orange' ? 'ring-2 ring-orange-500 bg-orange-50' : 'bg-white'
                  }`}
                >
                  <div className="w-4 h-4 rounded bg-orange-200 border border-orange-400 mb-1"></div> בינוני
                </button>
                <button
                  onClick={() => setSelectedZoneTool(selectedZoneTool === 'red' ? null : 'red')}
                  className={`p-2 rounded border text-sm flex flex-col items-center ${
                    selectedZoneTool === 'red' ? 'ring-2 ring-red-500 bg-red-50' : 'bg-white'
                  }`}
                >
                  <div className="w-4 h-4 rounded bg-red-200 border border-red-400 mb-1"></div> רחוק
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {selectedZoneTool === 'delete'
                  ? 'לחץ על שולחן למחיקה'
                  : selectedZoneTool
                    ? 'לחץ על שולחן לצביעה'
                    : 'גרור שולחנות למיקום הרצוי'}
              </p>
            </div>
          )}

          {/* Credits */}
          <div className="mt-auto p-4 border-t text-center text-gray-400 text-xs">
            <div className="flex items-center justify-center gap-1 mb-1">
              <span>נוצר באהבה למשרד החינוך</span>
              <Heart size={10} className="fill-red-400 text-red-400" />
            </div>
            <div className="flex items-center justify-center gap-1">
              <Mail size={10} />
              <span>nakar.tamir@gmail.com</span>
            </div>
          </div>
        </nav>

        {/* Workspace */}
        <main
          className={`flex-1 bg-gray-200 relative overflow-hidden touch-none ${
            activeTab === 'layout' ? 'pb-32 md:pb-0' : 'pb-20 md:pb-0'
          }`}
          ref={containerRef}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {/* Notification Toast */}
          {notification && (
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-6 py-3 rounded-full shadow-xl z-50 animate-bounce flex items-center gap-2">
              <Check size={20} className="text-green-400" />
              {notification}
            </div>
          )}

          {activeTab === 'layout' ? (
            <>
              {/* Mobile: Layout Tools Bar */}
              <div className="md:hidden fixed bottom-16 left-0 right-0 z-40 p-2">
                <div className="mx-auto max-w-xl bg-white/95 backdrop-blur border rounded-xl shadow-lg p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex gap-2">
                      <button
                        onClick={addDesk}
                        className="bg-white border hover:bg-gray-100 px-3 py-2 rounded flex items-center justify-center gap-2 text-sm"
                      >
                        <Plus size={16} /> הוסף
                      </button>
                      <button
                        onClick={() => setSelectedZoneTool(selectedZoneTool === 'delete' ? null : 'delete')}
                        className={`bg-white border hover:bg-red-50 px-3 py-2 rounded flex items-center justify-center gap-2 text-sm text-red-600 ${
                          selectedZoneTool === 'delete' ? 'ring-2 ring-red-500 bg-red-50' : ''
                        }`}
                      >
                        <Trash2 size={16} /> מחק
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedZoneTool(selectedZoneTool === 'green' ? null : 'green')}
                        className={`px-3 py-2 rounded border text-sm flex items-center gap-2 ${
                          selectedZoneTool === 'green' ? 'ring-2 ring-green-500 bg-green-50' : 'bg-white'
                        }`}
                      >
                        <div className="w-3 h-3 rounded bg-green-200 border border-green-400"></div> קרוב
                      </button>
                      <button
                        onClick={() => setSelectedZoneTool(selectedZoneTool === 'orange' ? null : 'orange')}
                        className={`px-3 py-2 rounded border text-sm flex items-center gap-2 ${
                          selectedZoneTool === 'orange' ? 'ring-2 ring-orange-500 bg-orange-50' : 'bg-white'
                        }`}
                      >
                        <div className="w-3 h-3 rounded bg-orange-200 border border-orange-400"></div> בינוני
                      </button>
                      <button
                        onClick={() => setSelectedZoneTool(selectedZoneTool === 'red' ? null : 'red')}
                        className={`px-3 py-2 rounded border text-sm flex items-center gap-2 ${
                          selectedZoneTool === 'red' ? 'ring-2 ring-red-500 bg-red-50' : 'bg-white'
                        }`}
                      >
                        <div className="w-3 h-3 rounded bg-red-200 border border-red-400"></div> רחוק
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    {selectedZoneTool === 'delete'
                      ? 'לחץ על שולחן למחיקה'
                      : selectedZoneTool
                        ? 'לחץ על שולחן לצביעה'
                        : 'גרור שולחנות למיקום הרצוי'}
                  </p>
                </div>
              </div>

              {/* Board Representation */}
              <div className="absolute top-4 left-1/2 transform -translate-x-1/2 w-1/3 h-4 bg-gray-800 rounded-lg shadow-lg flex items-center justify-center">
                <span className="text-white text-xs">לוח הכיתה</span>
              </div>

              {/* Desks Layer */}
              {desks.map(desk => (
                <Desk key={desk.id} desk={desk} />
              ))}

              {/* Layout Helper Text */}
              {selectedStudentForSwap && (
                <div className="absolute bottom-24 md:bottom-4 right-4 bg-blue-600 text-white px-4 py-2 rounded shadow-lg flex items-center gap-2 animate-pulse">
                  <Move size={16} /> בחר תלמיד אחר או כיסא פנוי להחלפה
                  <button onClick={() => setSelectedStudentForSwap(null)} className="hover:bg-blue-700 p-1 rounded ml-2">
                    <X size={14} />
                  </button>
                </div>
              )}
            </>
          ) : activeTab === 'constraints' ? (
            <div className="p-4 md:p-8 h-full max-w-4xl mx-auto">
              <ConstraintsPanel />
            </div>
          ) : activeTab === 'backup' ? (
            <div className="p-4 md:p-8 h-full max-w-5xl mx-auto">
              <BackupPanel />
            </div>
          ) : (
            <div className="p-4 md:p-8 h-full max-w-4xl mx-auto">
              <RosterPanel />
            </div>
          )}
        </main>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t shadow-lg">
        <div className="grid grid-cols-4">
          <button
            onClick={() => setActiveTab('layout')}
            className={`p-3 flex flex-col items-center justify-center gap-1 text-xs ${
              activeTab === 'layout' ? 'text-blue-700 font-bold bg-blue-50' : 'text-gray-600'
            }`}
          >
            <Layout size={18} /> הושבה
          </button>
          <button
            onClick={() => setActiveTab('constraints')}
            className={`p-3 flex flex-col items-center justify-center gap-1 text-xs ${
              activeTab === 'constraints' ? 'text-blue-700 font-bold bg-blue-50' : 'text-gray-600'
            }`}
          >
            <Settings size={18} /> מאפיינים
          </button>
          <button
            onClick={() => setActiveTab('roster')}
            className={`p-3 flex flex-col items-center justify-center gap-1 text-xs ${
              activeTab === 'roster' ? 'text-blue-700 font-bold bg-blue-50' : 'text-gray-600'
            }`}
          >
            <Users size={18} /> כיתה
          </button>
          <button
            onClick={() => setActiveTab('backup')}
            className={`p-3 flex flex-col items-center justify-center gap-1 text-xs ${
              activeTab === 'backup' ? 'text-blue-700 font-bold bg-blue-50' : 'text-gray-600'
            }`}
          >
            <FolderDown size={18} /> גיבוי
          </button>
        </div>
      </div>

      {/* Save Modal */}
      {isSaveModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-lg shadow-xl border p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold text-lg">שמירת גיבוי</div>
              <button onClick={closeModals} className="text-gray-500 hover:text-gray-700">
                <X size={18} />
              </button>
            </div>
            <label className="block text-sm text-gray-600 mb-2">שם לגיבוי</label>
            <input
              value={backupNameDraft}
              onChange={e => setBackupNameDraft(e.target.value)}
              placeholder="למשל: כיתה ט׳1 - פברואר"
              className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && void handleSaveBackup()}
            />
            <div className="text-xs text-gray-500 mt-2">
              נשמר ב־<span className="font-bold">{backupStorageKind === 'sync' ? 'Sync Storage' : 'Local Storage'}</span>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={closeModals} className="bg-white border hover:bg-gray-50 px-4 py-2 rounded">
                ביטול
              </button>
              <button
                onClick={() => void handleSaveBackup()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-bold"
                disabled={!backupNameDraft.trim()}
              >
                שמור
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore Modal */}
      {isRestoreModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-lg shadow-xl border p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold text-lg">שחזור כיתה</div>
              <button onClick={closeModals} className="text-gray-500 hover:text-gray-700">
                <X size={18} />
              </button>
            </div>

            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-600">
                בחר/י מהרשימה (אחסון: <span className="font-bold">{backupStorageKind === 'sync' ? 'Sync' : 'Local'}</span>)
              </div>
              <button onClick={() => void refreshBackups()} className="text-sm bg-white border hover:bg-gray-50 px-3 py-1.5 rounded">
                רענן
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto border rounded">
              {backups.length === 0 ? (
                <div className="p-4 text-gray-400 text-sm italic">אין גיבויים לשחזור.</div>
              ) : (
                backups.map(b => (
                  <button
                    key={b.key}
                    onClick={() => void handleRestoreBackupByName(b.name)}
                    className="w-full text-right p-3 border-b last:border-b-0 hover:bg-gray-50 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="font-bold truncate">{b.name}</div>
                      <div className="text-xs text-gray-500">{b.savedAt}</div>
                    </div>
                    <div className="text-green-700 font-bold text-sm flex-shrink-0">שחזר</div>
                  </button>
                ))
              )}
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={closeModals} className="bg-white border hover:bg-gray-50 px-4 py-2 rounded">
                סגור
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

