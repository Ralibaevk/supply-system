// === ВСТАВЬТЕ ССЫЛКУ ИЗ CODE.GS (ВАЖНО!) ===
const API_URL = "https://script.google.com/macros/s/AKfycbyUkY-XS2MuR1mzEJ7xPjOHLSxSOa94CFmgnxL-88NBM_htZ-kQxhomIrqFu3FltL4_/exec";

const api = {
  async call(action, params = {}, method = 'GET') {
    document.getElementById('loader').classList.remove('hidden');
    let url = `${API_URL}?action=${action}`;
    let opts = { method };

    if (method === 'POST') {
      opts.body = JSON.stringify(params);
      opts.headers = { "Content-Type": "text/plain;charset=utf-8" };
    } else {
      for (let k in params) url += `&${k}=${encodeURIComponent(params[k])}`;
    }

    try {
      const res = await fetch(url, opts);
      const json = await res.json();
      document.getElementById('loader').classList.add('hidden');

      if (json.error) {
        console.error("API Error:", json.error);
        throw new Error(json.error);
      }
      return json;
    } catch (e) {
      document.getElementById('loader').classList.add('hidden');
      console.error("Network/Fetch Error:", e);
      // Не показываем alert на каждый чих, пишем в консоль
      throw e;
    }
  }
};

const app = {
  suppliers: [],

  async init() {
    console.log("App init started...");

    // 1. Параллельная загрузка (чтобы ошибка в одном не ломала другое)
    Promise.allSettled([
      this.loadSuppliers(),
      this.refreshDashboard()
    ]).then(() => {
      console.log("Initial data loaded.");
    });

    // 2. Железобетонная привязка загрузчика файлов
    const input = document.getElementById('xlsInput');
    if (input) {
      // Клонируем, чтобы убить старые слушатели
      const newInput = input.cloneNode(true);
      input.parentNode.replaceChild(newInput, input);

      newInput.addEventListener('change', (e) => {
        console.log("File selected");
        manager.handleFile(e);
      });
    } else {
      console.error("Input #xlsInput not found!");
    }
  },

  async loadSuppliers() {
    try {
      this.suppliers = await api.call('getSuppliers');
      console.log("Suppliers loaded:", this.suppliers.length);
    } catch (e) {
      console.warn("Failed to load suppliers. Using empty list.");
      this.suppliers = [];
    }
  },

  async refreshDashboard() {
    try {
      const data = await api.call('getProjectsSummary');
      console.log("Projects loaded:", data.length);

      ['new', 'active', 'done'].forEach(id => {
        const el = document.getElementById('list-' + id);
        if (el) el.innerHTML = '';
      });

      if (!data || data.length === 0) {
        const el = document.getElementById('list-new');
        if (el) el.innerHTML = '<div style="color:#999; text-align:center; padding:20px;">Нет проектов</div>';
        return;
      }

      data.forEach(p => {
        const status = p.status || 'new';
        const container = document.getElementById(`list-${status}`);
        if (!container) return;

        const notBought = p.total - p.done;
        let badgeHtml = '';
        if (notBought > 0) badgeHtml = `<span class="ind-bad"><i class="fas fa-circle"></i> ${notBought}</span>`;
        else if (p.total > 0) badgeHtml = `<span class="ind-good"><i class="fas fa-check-circle"></i> Готово</span>`;
        else badgeHtml = `<span style="font-size:12px; color:#999;">Пусто</span>`;

        let archiveBtn = status === 'done'
          ? `<button class="btn btn-def" style="width:100%; margin-top:5px; font-size:12px;" onclick="app.archiveProject('${p.name}')">📦 В Архив</button>`
          : '';

        const card = document.createElement('div');
        card.className = 'p-card';
        card.draggable = true;
        card.ondragstart = (e) => app.drag(e, p.name);

        card.innerHTML = `
          <div class="pc-top">
            <span class="pc-name">${p.name}</span>
            <button onclick="app.deleteProject('${p.name}')" style="background:none; border:none; color:#ccc; cursor:pointer;">×</button>
          </div>
          <div class="pc-ind">${badgeHtml}</div>
          <div class="pc-actions">
            <button class="btn btn-def" onclick="manager.open('${p.name}')">✏️</button>
            <button class="btn btn-def" onclick="buyer.open('${p.name}')">🛒</button>
          </div>
          ${archiveBtn}
          <select class="mob-status-btn" onchange="app.moveProject('${p.name}', this.value)">
            <option value="new" ${status == 'new' ? 'selected' : ''}>Формируется</option>
            <option value="active" ${status == 'active' ? 'selected' : ''}>В закуп</option>
            <option value="done" ${status == 'done' ? 'selected' : ''}>Завершен</option>
          </select>
        `;
        container.appendChild(card);
      });
    } catch (e) {
      console.error("Dashboard error:", e);
      alert("Не удалось загрузить проекты. Проверьте консоль.");
    }
  },

  // === ARCHIVE & RESTORE ===
  async archiveProject(name) {
    if (!confirm(`В архив "${name}"?`)) return;
    await api.call('archiveProject', { sheetName: name }, 'POST');
    this.refreshDashboard();
  },
  async openArchive() {
    document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
    document.getElementById('view-archive').classList.remove('hidden');
    try {
      const list = await api.call('getArchivedList');
      const grid = document.getElementById('archiveList');
      grid.innerHTML = list.length ? '' : '<div style="text-align:center; color:#999; padding:20px;">Архив пуст</div>';
      list.forEach(item => {
        const card = document.createElement('div');
        card.className = 'p-card';
        card.style.borderLeftColor = '#607d8b';
        card.innerHTML = `
          <div class="pc-top"><span class="pc-name">${item.name}</span><span style="font-size:12px; color:#888;">${item.date}</span></div>
          <button class="btn btn-primary" style="width:100%; margin-top:10px;" onclick="app.unarchiveProject('${item.id}')">♻️ Восстановить</button>
        `;
        grid.appendChild(card);
      });
    } catch (e) { alert("Ошибка архива"); }
  },
  async unarchiveProject(id) {
    if (!confirm("Восстановить?")) return;
    await api.call('unarchiveProject', { id: id }, 'POST');
    this.goHome();
  },

  // === DRAG & DROP ===
  drag(ev, name) { ev.dataTransfer.setData("text", name); },
  allowDrop(ev) { ev.preventDefault(); },
  async drop(ev, newStatus) {
    ev.preventDefault();
    const name = ev.dataTransfer.getData("text");
    await this.moveProject(name, newStatus);
  },
  async moveProject(name, status) {
    await api.call('updateStatus', { sheetName: name, status: status }, 'POST');
    this.refreshDashboard();
  },

  // === SUPPLIERS ===
  openSuppliersEdit() {
    const tbody = document.getElementById('supEditBody');
    tbody.innerHTML = '';
    this.suppliers.forEach((s) => app.addSupplierRow(s.name, s.phone));
    // Принудительное открытие (flex)
    const m = document.getElementById('supEditModal');
    m.classList.remove('hidden');
    m.style.display = 'flex';
  },
  addSupplierRow(name = '', phone = '') {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input class="sup-name-inp" value="${name}" placeholder="Имя" style="width:100%; padding:5px;"></td>
      <td><input class="sup-phone-inp" value="${phone}" placeholder="Тел" style="width:100%; padding:5px;"></td>
      <td><button onclick="this.closest('tr').remove()" style="color:red; border:none; background:none;">×</button></td>
    `;
    document.getElementById('supEditBody').appendChild(tr);
  },
  async saveSuppliers() {
    const rows = document.querySelectorAll('#supEditBody tr');
    const newList = [];
    rows.forEach(tr => {
      const name = tr.querySelector('.sup-name-inp').value.trim();
      const phone = tr.querySelector('.sup-phone-inp').value.trim();
      if (name) newList.push({ name, phone });
    });
    await api.call('saveSuppliers', { list: newList }, 'POST');
    this.suppliers = newList;
    document.getElementById('supEditModal').style.display = 'none';
    alert('Сохранено');
  },

  newProject() { manager.open(''); },
  async deleteProject(name) {
    if (confirm(`Удалить "${name}"?`)) { await api.call('deleteProject', { sheetName: name }, 'POST'); this.refreshDashboard(); }
  },
  goHome() {
    document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
    document.getElementById('view-dashboard').classList.remove('hidden');
    this.refreshDashboard();
  }
};

const manager = {
  data: [],
  async open(name) {
    document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
    document.getElementById('view-manager').classList.remove('hidden');

    // Сброс инпута перед открытием
    document.getElementById('mgrName').value = '';

    if (name) {
      document.getElementById('mgrName').value = name;
      try {
        const sData = await api.call('getProjectData', { sheetName: name });
        this.data = sData.map(i => ({ ...i, checked: false, note: i.note || "" }));
      } catch (e) {
        alert("Ошибка загрузки данных проекта");
        this.data = [];
      }
    } else {
      document.getElementById('mgrName').value = `Заказ ${new Date().toLocaleDateString()}`;
      this.data = [];
    }
    this.render();
  },
  render() {
    const tbody = document.getElementById('mgrBody');
    tbody.innerHTML = '';
    const filter = document.getElementById('mgrSearch').value.toLowerCase();
    let total = 0;

    // Формируем опции один раз
    const supOpts = `<option value="">-</option>` + app.suppliers.map(s => `<option value="${s.name}">${s.name}</option>`).join('');

    this.data.forEach((item, i) => {
      const searchStr = (item.name + ' ' + item.art + ' ' + item.supplier).toLowerCase();
      if (filter && !searchStr.includes(filter)) return;
      item.sum = item.qty * item.price;
      total += item.sum;

      const tr = document.createElement('tr');
      if (item.supplier) tr.classList.add('has-supplier');
      if (item.checked) tr.style.background = '#fff9c4';

      tr.innerHTML = `
        <td class="chk"><input type="checkbox" ${item.checked ? 'checked' : ''} onchange="manager.check(${i},this.checked)"></td>
        <td><input value="${item.art || ''}" onchange="manager.upd(${i},'art',this.value)"></td>
        <td><input value="${item.name}" onchange="manager.upd(${i},'name',this.value)"></td>
        <td><input type="number" value="${item.qty}" onchange="manager.upd(${i},'qty',this.value)"></td>
        <td><input value="${item.unit}" onchange="manager.upd(${i},'unit',this.value)"></td>
        <td><input type="number" value="${item.price}" onchange="manager.upd(${i},'price',this.value)"></td>
        <td>${item.sum.toLocaleString()}</td>
        <td><select onchange="manager.upd(${i},'supplier',this.value)">${supOpts.replace(`"${item.supplier}"`, `"${item.supplier}" selected`)}</select></td>
        <td><input value="${item.note || ''}" placeholder="..." onchange="manager.upd(${i},'note',this.value)"></td>
      `;
      tbody.appendChild(tr);
    });
    document.getElementById('mgrTotal').innerText = total.toLocaleString() + ' ₸';
  },
  upd(i, f, v) { if (f === 'qty' || f === 'price') v = parseFloat(v) || 0; this.data[i][f] = v; if (f === 'qty' || f === 'price') this.render(); },
  check(i, v) { this.data[i].checked = v; this.render(); },
  toggleAll(v) { const f = document.getElementById('mgrSearch').value.toLowerCase(); this.data.forEach(i => { if (!f || i.name.toLowerCase().includes(f)) i.checked = v }); this.render(); },
  sort() { this.data.sort((a, b) => (a.supplier && !b.supplier) ? -1 : (b.supplier && !a.supplier) ? 1 : a.name.localeCompare(b.name)); this.render(); },
  delSel() { if (confirm('Удалить?')) { this.data = this.data.filter(i => !i.checked); document.getElementById('mgrAll').checked = false; this.render(); } },
  addRow() { this.data.unshift({ id: "", art: "", name: "Новая", qty: 1, unit: "шт", price: 0, supplier: "", note: "", done: false }); this.render(); },

  // MODALS
  openMerge() {
    const sel = this.data.filter(i => i.checked);
    if (sel.length < 2) return alert('Выберите 2+ строки');
    const list = document.getElementById('mergeList');
    list.innerHTML = sel.map((i, idx) => `<div style="padding:10px; border-bottom:1px solid #eee;"><label><input type="radio" name="mname" value="${idx}" ${idx === 0 ? 'checked' : ''}> <b>${i.name}</b> (${i.qty})</label></div>`).join('');

    const m = document.getElementById('mergeModal');
    m.classList.remove('hidden'); m.style.display = 'flex';
  },
  applyMerge() {
    const radios = document.getElementsByName('mname');
    let selIdx = -1; for (let r of radios) if (r.checked) selIdx = parseInt(r.value);
    if (selIdx === -1) return;
    const selItems = this.data.filter(i => i.checked);
    const main = selItems[selIdx];
    main.qty = selItems.reduce((acc, c) => acc + c.qty, 0);
    main.checked = false;
    this.data = this.data.filter(i => !i.checked || i === main);
    document.getElementById('mgrAll').checked = false;
    document.getElementById('mergeModal').style.display = 'none';
    this.render();
  },
  openSup() {
    const sel = this.data.filter(i => i.checked);
    if (!sel.length) return alert('Выберите строки');
    document.getElementById('supSelect').innerHTML = `<option value="">-- Сброс --</option>` + app.suppliers.map(s => `<option value="${s.name}">${s.name}</option>`);
    const m = document.getElementById('supModal');
    m.classList.remove('hidden'); m.style.display = 'flex';
  },
  applySup() {
    const v = document.getElementById('supSelect').value;
    this.data.forEach(i => { if (i.checked) { i.supplier = v; i.checked = false; } });
    document.getElementById('supModal').style.display = 'none';
    document.getElementById('mgrAll').checked = false;
    this.render();
  },
  async save() {
    const name = document.getElementById('mgrName').value;
    if (!name) return alert('Введите имя!');
    // 10 полей: id, art, name, qty, unit, price, sum, sup, note, done
    const arr = this.data.map(i => [i.id || "", i.art, i.name, i.qty, i.unit, i.price, i.qty * i.price, i.supplier, i.note || "", i.done || false]);
    await api.call('saveProject', { sheetName: name, data: arr, status: 'active' }, 'POST');
    alert('Сохранено!');
    app.goHome();
  },

  // === IMPORT (ПРИНУДИТЕЛЬНОЕ ОТКРЫТИЕ) ===
  handleFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    if (typeof XLSX === 'undefined') return alert("Библиотека Excel не загрузилась");

    const reader = new FileReader();
    reader.onload = function (ev) {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
        mapper.raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
        if (mapper.raw.length) mapper.show();
        else alert("Файл пустой");
      } catch (err) { alert(err); } finally { e.target.value = ''; }
    };
    reader.readAsArrayBuffer(f);
  }
};

const mapper = {
  raw: [],
  show() {
    const tbl = document.getElementById('mapTable');
    tbl.innerHTML = '';
    const maxCols = this.raw.reduce((a, b) => Math.max(a, b.length), 0);
    let html = '<tr>';
    for (let i = 0; i < maxCols; i++) {
      html += `<th><select class="map-sel" data-col="${i}">
        <option value="">Пропуск</option><option value="art">Артикул</option><option value="name">Название</option>
        <option value="qty">Кол-во</option><option value="unit">Ед. изм.</option><option value="price">Цена</option>
        <option value="supplier">Поставщик</option><option value="note">Примечание</option>
      </select></th>`;
    }
    html += '</tr>';
    this.raw.slice(0, 20).forEach(r => {
      html += '<tr>' + Array.from({ length: maxCols }).map((_, i) => `<td style="padding:5px; border:1px solid #eee;">${r[i] || ""}</td>`).join('') + '</tr>';
    });
    tbl.innerHTML = html;

    // ПРИНУДИТЕЛЬНО
    const m = document.getElementById('modal');
    m.classList.remove('hidden');
    m.style.display = 'flex';
    m.style.zIndex = '99999';
  },
  apply() {
    const m = {};
    document.querySelectorAll('.map-sel').forEach(s => { if (s.value) m[s.value] = parseInt(s.dataset.col); });
    if (m.name === undefined) return alert('Где Название?');
    manager.data = [];
    this.raw.forEach(r => {
      if (!r[m.name]) return;
      manager.data.push({
        id: "", art: r[m.art] != undefined ? String(r[m.art]) : "",
        name: String(r[m.name]),
        qty: m.qty != undefined ? (parseFloat(String(r[m.qty]).replace(',', '.')) || 1) : 1,
        unit: m.unit != undefined ? String(r[m.unit]) : "шт",
        price: m.price != undefined ? (parseFloat(String(r[m.price]).replace(',', '.')) || 0) : 0,
        supplier: m.supplier != undefined ? String(r[m.supplier]) : "",
        note: m.note != undefined ? String(r[m.note]) : "",
        done: false
      });
    });
    document.getElementById('modal').style.display = 'none';
    manager.render();
  }
};

// === BUYER LOGIC (OFFLINE-FIRST) ===
const buyer = {
  data: [],        // Полные данные с сервера
  localData: [],   // Локальная копия для редактирования
  hasChanges: false,
  currentFilter: 'ALL',
  currentSheet: '',

  async open(name) {
    if (this.hasChanges && !confirm("Есть несохраненные изменения. Сбросить их?")) return;

    this.currentSheet = name;
    document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
    document.getElementById('view-buyer').classList.remove('hidden');
    document.getElementById('buyTitle').innerText = name;

    // Сброс состояния
    this.hasChanges = false;
    this.toggleSaveBar(false);
    document.getElementById('buyList').innerHTML = '<div style="text-align:center; padding:40px; color:#999;">Загрузка...</div>';

    // Загрузка
    try {
      const serverData = await api.call('getProjectData', { sheetName: name });
      // Глубокая копия данных для локальной работы
      this.data = JSON.parse(JSON.stringify(serverData));
      this.localData = JSON.parse(JSON.stringify(serverData));

      this.renderFilters();
      this.render();
    } catch (e) {
      alert("Ошибка загрузки: " + e.message);
      app.goHome();
    }
  },

  // Генерация кнопок-фильтров
  renderFilters() {
    const container = document.getElementById('buyFilters');

    // Собираем уникальных поставщиков из ЭТОГО списка
    const uniqueSuppliers = [...new Set(this.localData.map(i => i.supplier).filter(s => s && s.trim() !== ""))].sort();

    let html = `<div class="filter-chip ${this.currentFilter === 'ALL' ? 'active' : ''}" onclick="buyer.setFilter('ALL')">Все</div>`;

    // Кнопка для "Без поставщика"
    const hasEmpty = this.localData.some(i => !i.supplier);
    if (hasEmpty) {
      html += `<div class="filter-chip ${this.currentFilter === 'NONE' ? 'active' : ''}" onclick="buyer.setFilter('NONE')">Не назначено</div>`;
    }

    uniqueSuppliers.forEach(sup => {
      const active = this.currentFilter === sup ? 'active' : '';
      html += `<div class="filter-chip ${active}" onclick="buyer.setFilter('${sup}')">${sup}</div>`;
    });

    container.innerHTML = html;
  },

  setFilter(filter) {
    this.currentFilter = filter;
    this.renderFilters(); // Обновить активный класс
    this.render();
  },

  render() {
    const container = document.getElementById('buyList');
    container.innerHTML = '';

    let totalSum = 0;
    let totalCount = 0;
    let doneCount = 0;

    this.localData.forEach(item => {
      // 1. Фильтрация
      let visible = true;
      if (this.currentFilter === 'NONE') {
        if (item.supplier) visible = false;
      } else if (this.currentFilter !== 'ALL') {
        if (item.supplier !== this.currentFilter) visible = false;
      }

      // Считаем статистику по ВСЕМУ проекту, а не только фильтру
      if (item.done) doneCount++;
      totalCount++;
      totalSum += (item.qty * item.price);

      if (!visible) return;

      // 2. Отрисовка карточки
      const div = document.createElement('div');
      div.className = `b-card ${item.done ? 'done' : ''}`;

      div.innerHTML = `
        <div class="b-row-top">
          <div class="b-name">${item.name}</div>
          <div class="b-check-btn" onclick="buyer.toggle(${item.rowIndex})">
            ${item.done ? '<i class="fas fa-check"></i>' : ''}
          </div>
        </div>
        
        <div class="b-row-mid">
          <span class="b-badge">${item.qty} ${item.unit}</span>
          ${item.supplier ? `<span class="b-supplier"><i class="fas fa-truck"></i> ${item.supplier}</span>` : ''}
        </div>
        
        ${item.note ? `<div style="font-size:12px; color:#888; margin-top:5px;">Note: ${item.note}</div>` : ''}

        <div class="b-row-bot">
          <input type="number" class="b-price-inp" 
            value="${item.price > 0 ? item.price : ''}" 
            placeholder="Цена..." 
            onchange="buyer.updatePrice(${item.rowIndex}, this.value)">
          <div style="font-weight:bold; font-size:14px; color:#555;">₸</div>
        </div>
      `;
      container.appendChild(div);
    });

    // Обновляем шапку
    document.getElementById('buyProgressText').innerText = `${doneCount} из ${totalCount} куплено`;
    document.getElementById('buyTotalSum').innerText = totalSum.toLocaleString() + ' ₸';
  },

  // === ЛОКАЛЬНЫЕ ИЗМЕНЕНИЯ (МГНОВЕННЫЕ) ===

  toggle(rowIndex) {
    const item = this.localData.find(i => i.rowIndex === rowIndex);
    if (item) {
      item.done = !item.done; // Меняем в памяти
      this.markAsChanged();
      this.render(); // Перерисовываем (быстро)
    }
  },

  updatePrice(rowIndex, value) {
    const item = this.localData.find(i => i.rowIndex === rowIndex);
    if (item) {
      item.price = parseFloat(value) || 0;
      this.markAsChanged();
      // render не вызываем, чтобы не сбивать фокус, только обновляем сумму в шапке
      this.recalcTotal();
    }
  },

  recalcTotal() {
    let sum = this.localData.reduce((acc, i) => acc + (i.qty * i.price), 0);
    document.getElementById('buyTotalSum').innerText = sum.toLocaleString() + ' ₸';
  },

  markAsChanged() {
    this.hasChanges = true;
    this.toggleSaveBar(true);
  },

  toggleSaveBar(show) {
    const bar = document.getElementById('unsavedBar');
    if (show) bar.classList.add('visible');
    else bar.classList.remove('visible');
  },

  // === СОХРАНЕНИЕ НА СЕРВЕР (ПАКЕТНОЕ) ===

  async saveBatch() {
    const btn = document.querySelector('#unsavedBar .save-btn');
    const oldText = btn.innerText;
    btn.innerText = "⏳ Сохраняем...";
    btn.disabled = true;

    try {
      // Превращаем объекты обратно в массив массивов для Code.gs saveAsNamedSheet
      // Порядок: [id, art, name, qty, unit, price, sum, supplier, note, done]
      const arrayData = this.localData.map(i => [
        i.id, i.art, i.name, i.qty, i.unit, i.price,
        (i.qty * i.price), // sum пересчитываем
        i.supplier, i.note, i.done
      ]);

      // Используем saveProject, так как он перезаписывает лист полностью - это надежнее для пакетного обновления
      // Важно: статус передаем 'active' (или текущий, если бы знали), чтобы не сбросился
      await api.call('saveProject', {
        sheetName: this.currentSheet,
        data: arrayData,
        status: 'active'
      }, 'POST');

      this.hasChanges = false;
      this.toggleSaveBar(false);
      btn.innerText = "✅ Готово";

      // Обновляем "эталонные" данные
      this.data = JSON.parse(JSON.stringify(this.localData));

      setTimeout(() => {
        btn.innerText = oldText;
        btn.disabled = false;
      }, 2000);

    } catch (e) {
      alert("Ошибка сохранения: " + e.message);
      btn.innerText = oldText;
      btn.disabled = false;
    }
  },

  checkClose() {
    if (this.hasChanges) {
      if (confirm("Есть несохраненные изменения. Выйти без сохранения?")) {
        app.goHome();
      }
    } else {
      app.goHome();
    }
  }
};

window.onload = () => app.init();