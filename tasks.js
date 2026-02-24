// Task Management System

const DEFAULT_SETTINGS = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakInterval: 4,
  autoStartNext: false,
  notificationEnabled: true,
  soundEnabled: true,
  openAlarmPage: true,
  theme: 'light'
};

// Task categories with i18n
function getTaskCategories() {
  return {
    work: { name: i18n('cat_work'), icon: 'work' },
    study: { name: i18n('cat_study'), icon: 'school' },
    reading: { name: i18n('cat_reading'), icon: 'menu_book' },
    coding: { name: i18n('cat_coding'), icon: 'code' },
    writing: { name: i18n('cat_writing'), icon: 'edit' },
    meeting: { name: i18n('cat_meeting'), icon: 'groups' },
    exercise: { name: i18n('cat_exercise'), icon: 'fitness_center' },
    other: { name: i18n('cat_other'), icon: 'more_horiz' }
  };
}

// Priority labels with i18n
function getPriorityLabels() {
  return {
    high: { name: i18n('priority_high'), class: 'priority-high' },
    medium: { name: i18n('priority_medium'), class: 'priority-medium' },
    low: { name: i18n('priority_low'), class: 'priority-low' }
  };
}

function getStorage(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function getSyncStorage(keys) {
  return new Promise((resolve) => chrome.storage.sync.get(keys, resolve));
}

function setStorage(data) {
  return new Promise((resolve) => chrome.storage.local.set(data, resolve));
}

function mergeSettings(rawSettings) {
  return { ...DEFAULT_SETTINGS, ...(rawSettings || {}) };
}

// DOM Elements
const addTaskBtn = document.getElementById('addTaskBtn');
const categoryFilter = document.getElementById('categoryFilter');
const statusFilter = document.getElementById('statusFilter');
const pinnedTasksList = document.getElementById('pinnedTasksList');
const taskList = document.getElementById('taskList');
const emptyState = document.getElementById('emptyState');
const taskModal = document.getElementById('taskModal');
const modalOverlay = document.getElementById('modalOverlay');
const closeModalBtn = document.getElementById('closeModalBtn');
const taskForm = document.getElementById('taskForm');
const modalTitle = document.getElementById('modalTitle');
const taskId = document.getElementById('taskId');
const taskTitleInput = document.getElementById('taskTitle');
const taskDescription = document.getElementById('taskDescription');
const taskCategory = document.getElementById('taskCategory');
const taskPriority = document.getElementById('taskPriority');
const taskEstimated = document.getElementById('taskEstimated');
const cancelBtn = document.getElementById('cancelBtn');

// Global state
let tasks = [];
let editingTaskId = null;

// Initialize theme
async function initTheme() {
  const result = await getStorage(['settings']);
  const settings = mergeSettings(result.settings);
  const theme = settings.theme || 'light';
  document.documentElement.setAttribute('data-theme', theme);

  // Initialize i18n and apply translations
  await initI18n();
  applyI18nToDocument();
}

// Task CRUD operations
async function loadTasks() {
  const result = await getStorage(['tasks']);
  tasks = Array.isArray(result.tasks) ? result.tasks : [];
  renderTasks();
}

async function saveTasks() {
  await setStorage({ tasks });
}

function createTask(taskData) {
  return {
    id: Date.now(),
    title: taskData.title || '',
    description: taskData.description || '',
    category: taskData.category || 'other',
    priority: taskData.priority || 'medium',
    estimatedMinutes: taskData.estimatedMinutes || null,
    completed: false,
    pinned: false,
    createdAt: new Date().toISOString(),
    completedAt: null
  };
}

async function addTask(taskData) {
  const newTask = createTask(taskData);
  tasks.push(newTask);
  await saveTasks();
  renderTasks();
}

async function updateTask(taskId, updates) {
  const index = tasks.findIndex(t => t.id === taskId);
  if (index !== -1) {
    tasks[index] = { ...tasks[index], ...updates };
    await saveTasks();
    renderTasks();
  }
}

async function deleteTask(taskId) {
  tasks = tasks.filter(t => t.id !== taskId);
  await saveTasks();
  renderTasks();
}

async function toggleTaskCompleted(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (task) {
    task.completed = !task.completed;
    task.completedAt = task.completed ? new Date().toISOString() : null;
    await saveTasks();
    renderTasks();
  }
}

async function toggleTaskPinned(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (task) {
    task.pinned = !task.pinned;
    await saveTasks();
    renderTasks();
  }
}

async function startFocus(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  // Update timer state in background
  const result = await getStorage(['timerState', 'settings']);
  const syncResult = await getSyncStorage(['settings']);
  const settings = mergeSettings(result.settings || syncResult.settings);
  const currentTimerState = result.timerState;

  const timerState = {
    phase: 'focus',
    totalSeconds: (task.estimatedMinutes || settings.focusMinutes) * 60,
    remainingSeconds: (task.estimatedMinutes || settings.focusMinutes) * 60,
    isRunning: false,
    isPaused: false,
    endTime: null,
    completedFocusCount: currentTimerState?.completedFocusCount || 0,
    currentTask: task.title,
    currentTaskId: taskId
  };

  await setStorage({ timerState });

  // Close tasks tab and open popup
  window.close();
}

// Filter tasks
function getFilteredTasks() {
  const category = categoryFilter.value;
  const status = statusFilter.value;

  return tasks.filter(task => {
    if (category !== 'all' && task.category !== category) return false;
    if (status === 'pending' && task.completed) return false;
    if (status === 'completed' && !task.completed) return false;
    return true;
  });
}

// Render tasks
function renderTasks() {
  const filtered = getFilteredTasks();
  const pinned = filtered.filter(t => t.pinned && !t.completed);
  const regular = filtered.filter(t => !t.pinned || t.completed);

  pinnedTasksList.innerHTML = '';
  taskList.innerHTML = '';

  const hasTasks = filtered.length > 0;
  emptyState.style.display = hasTasks ? 'none' : 'block';

  if (pinned.length > 0) {
    document.getElementById('pinnedTasks').style.display = 'block';
    pinned.forEach(task => pinnedTasksList.appendChild(createTaskElement(task)));
  } else {
    document.getElementById('pinnedTasks').style.display = 'none';
  }

  if (regular.length > 0) {
    document.getElementById('regularTasks').style.display = 'block';
    regular.forEach(task => taskList.appendChild(createTaskElement(task)));
  } else if (pinned.length === 0) {
    document.getElementById('regularTasks').style.display = 'none';
  }
}

function createTaskElement(task) {
  const div = document.createElement('div');
  div.className = `task-item ${task.completed ? 'completed' : ''}`;
  div.dataset.taskId = task.id;

  const TASK_CATEGORIES = getTaskCategories();
  const PRIORITY_LABELS = getPriorityLabels();

  const categoryInfo = TASK_CATEGORIES[task.category] || TASK_CATEGORIES.other;
  const priorityInfo = PRIORITY_LABELS[task.priority] || PRIORITY_LABELS.medium;

  div.innerHTML = `
    <div class="task-checkbox ${task.completed ? 'checked' : ''}">
      ${task.completed ? '<span class="material-icons">check</span>' : ''}
    </div>
    <div class="task-item-content">
      <div class="task-item-title">${escapeHtml(task.title)}</div>
      <div class="task-item-meta">
        <span class="task-item-category category-${task.category}">
          <span class="material-icons" style="font-size: 12px;">${categoryInfo.icon}</span>
          ${categoryInfo.name}
        </span>
        ${task.estimatedMinutes ? `<span><span class="material-icons" style="font-size: 12px;">schedule</span>${task.estimatedMinutes}分钟</span>` : ''}
        <span class="task-item-priority ${priorityInfo.class}">
          <span class="material-icons" style="font-size: 12px;">flag</span>
          ${priorityInfo.name}
        </span>
      </div>
    </div>
    <div class="task-actions">
      <button class="task-action-btn start-focus-btn" title="${i18n('action_start_focus')}">
        <span class="material-icons" style="font-size: 14px;">play_arrow</span>
      </button>
      <button class="task-action-btn edit-btn" title="${i18n('action_edit')}">
        <span class="material-icons">edit</span>
      </button>
      <button class="task-action-btn pin-btn ${task.pinned ? 'pinned' : ''}" title="${task.pinned ? i18n('action_unpin') : i18n('action_pin')}">
        <span class="material-icons">${task.pinned ? 'push_pin' : 'push_pin'}</span>
      </button>
      <button class="task-action-btn delete-btn" title="${i18n('action_delete')}">
        <span class="material-icons">delete</span>
      </button>
    </div>
  `;

  // Event listeners
  const checkbox = div.querySelector('.task-checkbox');
  checkbox.addEventListener('click', () => toggleTaskCompleted(task.id));

  const startBtn = div.querySelector('.start-focus-btn');
  startBtn.addEventListener('click', () => startFocus(task.id));

  const editBtn = div.querySelector('.edit-btn');
  editBtn.addEventListener('click', () => openEditModal(task));

  const pinBtn = div.querySelector('.pin-btn');
  pinBtn.addEventListener('click', () => toggleTaskPinned(task.id));

  const deleteBtn = div.querySelector('.delete-btn');
  deleteBtn.addEventListener('click', () => {
    if (confirm(i18n('confirm_delete_task'))) {
      deleteTask(task.id);
    }
  });

  return div;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Modal functions
function openModal() {
  taskModal.classList.add('active');
  taskTitleInput.focus();
}

function closeModal() {
  taskModal.classList.remove('active');
  taskForm.reset();
  editingTaskId = null;
  modalTitle.textContent = i18n('modal_new_task');
}

function openEditModal(task) {
  editingTaskId = task.id;
  modalTitle.textContent = i18n('modal_edit_task');

  taskId.value = task.id;
  taskTitleInput.value = task.title;
  taskDescription.value = task.description || '';
  taskCategory.value = task.category;
  taskPriority.value = task.priority;
  taskEstimated.value = task.estimatedMinutes || '';

  openModal();
}

// Form submission
taskForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const taskData = {
    title: taskTitleInput.value.trim(),
    description: taskDescription.value.trim(),
    category: taskCategory.value,
    priority: taskPriority.value,
    estimatedMinutes: taskEstimated.value ? parseInt(taskEstimated.value, 10) : null
  };

  if (editingTaskId) {
    await updateTask(editingTaskId, taskData);
  } else {
    await addTask(taskData);
  }

  closeModal();
});

// Event listeners
addTaskBtn.addEventListener('click', openModal);

closeModalBtn.addEventListener('click', closeModal);

modalOverlay.addEventListener('click', closeModal);

cancelBtn.addEventListener('click', closeModal);

categoryFilter.addEventListener('change', renderTasks);

statusFilter.addEventListener('change', renderTasks);

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && taskModal.classList.contains('active')) {
    closeModal();
  }
});

// Theme change listener
chrome.storage.onChanged.addListener((changes) => {
  if (changes.settings && changes.settings.newValue) {
    const theme = changes.settings.newValue.theme || 'light';
    document.documentElement.setAttribute('data-theme', theme);
  }
  if (changes.tasks) {
    tasks = Array.isArray(changes.tasks.newValue) ? changes.tasks.newValue : [];
    renderTasks();
  }
});

// Initialize
initTheme().then(() => {
  loadTasks().catch(err => console.error(i18n('error_load_tasks'), err));
});
