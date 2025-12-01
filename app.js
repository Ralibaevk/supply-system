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
      if (json.error) throw new Error(json.error);
      return json;
    } catch (e) {
      document.getElementById('loader').classList.add('hidden');
      alert("Ошибка: " + e.message);
      throw e;
    }
  }
};

const app = {
  suppliers: [], // Array of {name, phone}

  async init() {
    this.refreshDashboard();
    try {
      this.suppliers = await api.call('getSuppliers');
    } catch (e) { }

    // File handler
    const input = document.getElementById('xlsInput');
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);
    newInput.addEventListener('change', (e) => manager.handleFile(e));
  },

  async refreshDashboard() {
    const data = await api.call('getProjectsSummary'); // Получаем сводку {name, status, total, done}

    // Очистка колонок
    ['new', 'active', 'done'].forEach(id => document.getElementById('list-' + id).innerHTML = '');

    if (data.length === 0) {
      document.getElementById('list-new').innerHTML = '<div style="color:#999; text-align:center;">Нет проектов</div>';
      return;
    }

    data.forEach(p => {
      // Определяем статус (по умолчанию new)
      const status = p.status || 'new';
      const container = document.getElementById(`list-${status}`);
      if (!container) return; // Защита

      // Индикаторы
      const notBought = p.total - p.done;
      let badgeHtml = '';
      if (notBought > 0) {
        badgeHtml = `<span class="ind-bad"><i class="fas fa-circle"></i> ${notBought}</span>`;
      } else if (p.total > 0 && notBought === 0) {
        badgeHtml = `<span class="ind-good"><i class="fas fa-check-circle"></i> Готово</span>`;
      } else {
        badgeHtml = `<span style="font-size:12px; color:#999;">Пусто</span>`;
      }

      // Кнопка "В АРХИВ" появляется только если проект в колонке "Завершен"
      let archiveBtn = '';
      if (status === 'done') {
        archiveBtn = `<button class="p-btn p-btn-arc" onclick="app.archiveProject('${p.name}')" style="background:#607d8b; color:white; margin-top:5px; width:100%;">📦 В Архив</button>`;
      }

      // Карточка
      const card = document.createElement('div');
      card.className = 'p-card';
      card.draggable = true;
      // События для Drag-and-Drop
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
  },

  // === ЛОГИКА АРХИВАЦИИ ===
  async archiveProject(name) {
    if (!confirm(`Перенести "${name}" в завершенные (Архив)?\nПроект будет удален с доски и сохранен в истории.`)) return;
    await api.call('archiveProject', { sheetName: name }, 'POST');
    this.refreshDashboard();
  },

  async openArchive() {
    document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
    document.getElementById('view-archive').classList.remove('hidden');

    const list = await api.call('getArchivedList');
    const grid = document.getElementById('archiveList');
    grid.innerHTML = list.length ? '' : '<div style="text-align:center; color:#999; width:100%;">Архив пуст</div>';

    list.forEach(item => {
      const card = document.createElement('div');
      card.className = 'project-card';
      card.style.borderLeftColor = '#607d8b';
      card.innerHTML = `
        <div class="pc-top">
          <span class="pc-name">${item.name}</span>
          <span style="font-size:12px; color:#888;">${item.date}</span>
        </div>
        <button class="btn btn-primary" style="width:100%; margin-top:10px;" onclick="app.unarchiveProject('${item.id}')">♻️ Восстановить</button>
      `;
      grid.appendChild(card);
    });
  },

  async unarchiveProject(id) {
    if (!confirm("Восстановить этот проект на доску?")) return;
    await api.call('unarchiveProject', { id: id }, 'POST');
    alert("Проект восстановлен!");
    this.goHome();
  },

  // === DRAG AND DROP ===
  drag(ev, name) {
    ev.dataTransfer.setData("text", name);
  },
  allowDrop(ev) {
    ev.preventDefault();
  },
  async drop(ev, newStatus) {
    ev.preventDefault();
    const name = ev.dataTransfer.getData("text");
    await this.moveProject(name, newStatus);
  },
  async moveProject(name, status) {
    // Оптимистичное обновление (можно сразу перерисовать, но проще перезагрузить)
    await api.call('updateStatus', { sheetName: name, status: status }, 'POST');
    this.refreshDashboard();
  },

  // === SUPPLIERS CRUD ===
  openSuppliersEdit() {
    const tbody = document.getElementById('supEditBody');
    tbody.innerHTML = '';
    this.suppliers.forEach((s, idx) => app.addSupplierRow(s.name, s.phone));
    document.getElementById('supEditModal').classList.remove('hidden');
  },
  addSupplierRow(name = '', phone = '') {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input class="sup-name-inp" value="${name}" placeholder="Название" style="width:100%; border:1px solid #ddd; padding:5px;"></td>
      <td><input class="sup-phone-inp" value="${phone}" placeholder="Телефон" style="width:100%; border:1px solid #ddd; padding:5px;"></td>
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
    document.getElementById('supEditModal').classList.add('hidden');
    alert('Поставщики обновлены');
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

// === MANAGER ===
const manager = {
  data: [],
  async open(name) {
    document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
    document.getElementById('view-manager').classList.remove('hidden');
    if (name) {
      document.getElementById('mgrName').value = name;
      const sData = await api.call('getProjectData', { sheetName: name });
      this.data = sData.map(i => ({ ...i, checked: false, note: i.note || "" }));
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
    // Опции поставщиков
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
  upd(i, f, v) {
    if (f === 'qty' || f === 'price') v = parseFloat(v) || 0;
    this.data[i][f] = v;
    if (f === 'qty' || f === 'price') this.render();
  },
  check(i, v) { this.data[i].checked = v; this.render(); },
  toggleAll(v) {
    const filter = document.getElementById('mgrSearch').value.toLowerCase();
    this.data.forEach(i => { if (!filter || i.name.toLowerCase().includes(filter)) i.checked = v; });
    this.render();
  },
  sort() {
    this.data.sort((a, b) => (a.supplier && !b.supplier) ? -1 : (b.supplier && !a.supplier) ? 1 : a.name.localeCompare(b.name));
    this.render();
  },
  delSel() {
    if (confirm('Удалить?')) { this.data = this.data.filter(i => !i.checked); document.getElementById('mgrAll').checked = false; this.render(); }
  },
  addRow() {
    this.data.unshift({ id: "", art: "", name: "Новая", qty: 1, unit: "шт", price: 0, supplier: "", note: "", done: false });
    this.render();
  },
  openMerge() {
    const sel = this.data.filter(i => i.checked);
    if (sel.length < 2) return alert('Выберите >= 2 строк');
    const list = document.getElementById('mergeList');
    list.innerHTML = sel.map((i, idx) => `
      <div style="padding:10px; border-bottom:1px solid #eee;"><label><input type="radio" name="mname" value="${idx}" ${idx === 0 ? 'checked' : ''}> <b>${i.name}</b> (${i.qty})</label></div>`).join('');
    document.getElementById('mergeModal').classList.remove('hidden');
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
    document.getElementById('mergeModal').classList.add('hidden');
    this.render();
  },
  openSup() {
    const sel = this.data.filter(i => i.checked);
    if (!sel.length) return alert('Выберите строки');
    document.getElementById('supSelect').innerHTML = `<option value="">-- Сброс --</option>` + app.suppliers.map(s => `<option value="${s.name}">${s.name}</option>`);
    document.getElementById('supModal').classList.remove('hidden');
  },
  applySup() {
    const v = document.getElementById('supSelect').value;
    this.data.forEach(i => { if (i.checked) { i.supplier = v; i.checked = false; } });
    document.getElementById('supModal').classList.add('hidden');
    document.getElementById('mgrAll').checked = false;
    this.render();
  },
  async save() {
    const name = document.getElementById('mgrName').value;
    if (!name) return alert('Введите имя!');
    // Сохраняем и статус текущий, если он был, иначе 'new'
    // Но так как мы не знаем статус в редакторе, пусть будет 'new' или тот, что был? 
    // Упростим: при сохранении статус не меняем, он остается в ячейке B1 (бэкенд сам разберется, если мы его не перезатрем)
    // Но наш saveAsNamedSheet перезатирает. Значит надо передать.
    // Пока передадим "active", так как если редактируем - значит работаем.
    const arr = this.data.map(i => [i.id || "", i.art, i.name, i.qty, i.unit, i.price, i.qty * i.price, i.supplier, i.note || "", i.done || false]);

    // ВАЖНО: Мы не знаем текущий статус проекта в редакторе. 
    // Для простоты сохраняем как "active" (в работе), либо надо прокидывать статус.
    await api.call('saveProject', { sheetName: name, data: arr, status: 'active' }, 'POST');
    alert('Сохранено!');
    app.goHome(); // Вернуться на главную
  },
  handleFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    if (typeof XLSX === 'undefined') return alert("Библиотека не готова");
    const reader = new FileReader();
    reader.onload = function (ev) {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
        mapper.raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
        if (mapper.raw.length) mapper.show();
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
        <option value="">Пропуск</option>
        <option value="art">Артикул</option>
        <option value="name">Название</option>
        <option value="qty">Кол-во</option>
        <option value="unit">Ед. изм.</option>
        <option value="price">Цена</option>
        <option value="supplier">Поставщик</option>
        <option value="note">Примечание</option>
      </select></th>`;
    }
    html += '</tr>';
    this.raw.slice(0, 5).forEach(r => {
      html += '<tr>' + Array.from({ length: maxCols }).map((_, i) => `<td style="padding:5px; border:1px solid #eee;">${r[i] || ""}</td>`).join('') + '</tr>';
    });
    tbl.innerHTML = html;
    document.getElementById('modal').classList.remove('hidden');
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
    document.getElementById('modal').classList.add('hidden');
    manager.render();
  }
};

const buyer = {
  data: [],
  currentSheet: '',
  async open(name) {
    this.currentSheet = name;
    document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
    document.getElementById('view-buyer').classList.remove('hidden');
    document.getElementById('buyTitle').innerText = name;
    this.data = await api.call('getProjectData', { sheetName: name });
    this.initFilters();
    this.render();
  },
  initFilters() {
    const sel = document.getElementById('buySupFilter');
    const u = [...new Set([...app.suppliers.map(s => s.name), ...this.data.map(i => i.supplier)])].filter(Boolean).sort();
    sel.innerHTML = '<option value="ALL">Все поставщики</option>' + u.map(s => `<option value="${s}">${s}</option>`).join('');
  },
  render() {
    const cont = document.getElementById('buyList');
    cont.innerHTML = '';
    const filter = document.getElementById('buySupFilter').value;
    let total = 0, done = 0, visible = 0;

    this.data.forEach(item => {
      if (filter !== 'ALL' && item.supplier !== filter) return;
      visible++; if (item.done) done++; total += (item.qty * item.price);

      // Ищем телефон поставщика
      const supObj = app.suppliers.find(s => s.name === item.supplier);
      const phoneHtml = supObj && supObj.phone ? `<a href="tel:${supObj.phone}" style="color:#2e7d32; text-decoration:none;"><i class="fas fa-phone"></i></a>` : '';

      const div = document.createElement('div');
      div.className = `b-card ${item.done ? 'done' : ''}`;
      div.innerHTML = `
        <div class="b-head">${item.name}</div>
        <div style="font-size:12px; color:#666; margin-bottom:5px;">${item.note || ""}</div>
        <div class="b-meta">
          <span class="b-badge">${item.qty} ${item.unit}</span>
          <div style="display:flex; align-items:center; gap:5px;">
            ${phoneHtml}
            <span style="font-weight:bold; font-size:13px; color:#555;">${item.supplier || "Нет пост."}</span>
          </div>
        </div>
        <div class="b-actions">
          <input type="number" class="b-price" value="${item.price || ''}" placeholder="0" 
            onchange="buyer.upd(${item.rowIndex}, 'price', this.value)">
          <button class="b-btn" onclick="buyer.toggle(${item.rowIndex})">
            ${item.done ? '✔' : 'КУПИТЬ'}
          </button>
        </div>`;
      cont.appendChild(div);
    });
    document.getElementById('buyTotal').innerText = total.toLocaleString() + ' ₸';
    document.getElementById('buyBar').style.width = (visible ? (done / visible) * 100 : 0) + '%';
  },
  upd(row, f, v) {
    const item = this.data.find(i => i.rowIndex === row);
    if (f === 'price') v = parseFloat(v) || 0;
    item[f] = v;
    if (f === 'price') this.render();
    api.call('updateItem', { sheetName: this.currentSheet, rowIndex: row, field: f, value: v }, 'POST');
  },
  toggle(row) {
    const item = this.data.find(i => i.rowIndex === row);
    item.done = !item.done;
    this.render();
    api.call('updateItem', { sheetName: this.currentSheet, rowIndex: row, field: 'done', value: item.done }, 'POST');
  }
};

window.onload = () => app.init();
