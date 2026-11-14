// Page markup and actions for Pro views. Kept out of app.js to limit its size.
import { isPro, isPreviewHost, previewUnlockOn, setPreviewUnlock, refreshPro, proSource, proBadge, renderProSoon } from './pro.js';
import { allDueDoses, createMed, isLowStock, lowStockMeds, markTaken, takenOn, undoTaken } from './meds.js';
import { TRADE_SPECIALTIES, createTradeJob, createTradeReminder, createTradesperson, dueReminders, jobsFor, markReminderDone, nextReminderDue, reminderStatus, specialtyOf, telHref } from './trades.js';
import { applyBankImport, matchBankRows, parseBankCsv, undoBankImport } from './bank-import.js';
import { monthReport, svgBars, svgWeekLine } from './reports.js';

export function renderMedsPage(ctx) {
  const { t, escapeHtml, state, today, nowTime, form, money } = ctx;
  if (!isPro()) {
    return page(ctx, 'Φάρμακα', 'Δόσεις στις ώρες σου, ανά άτομο, με υπενθύμιση όταν τελειώνουν τα χάπια.',
      renderProSoon({ title: 'Φάρμακα', t, escapeHtml }));
  }
  const meds = state.meds || [];
  const due = allDueDoses(meds, today, nowTime);
  const low = lowStockMeds(meds);
  const people = (state.people || []).map((p) => p.name).filter(Boolean);
  const edit = form?.mode === 'edit' ? meds.find((m) => m.id === form.id) : null;
  const showForm = form?.mode === 'new' || edit;
  let body = '';
  if (low.length) {
    body += `<section class="panel settings-card" id="meds-low"><span class="stat-icon amber">⚠️</span><h2>${escapeHtml(t('Τελειώνουν σύντομα'))}</h2><ul class="waste-top">${low.map((m) => `<li><span class="product-name">${escapeHtml(m.name)}</span><strong data-no-i18n>${m.quantity}</strong></li>`).join('')}</ul></section>`;
  }
  if (due.length) {
    body += `<section class="panel settings-card" id="meds-due"><span class="stat-icon">💊</span><h2>${escapeHtml(t('Σήμερα'))}</h2><ul class="chore-list">${due.map((row) => `<li class="chore-row"><div><strong>${escapeHtml(row.med.name)}</strong><p class="field-hint">${escapeHtml(row.time)}${row.med.person ? ` · ${escapeHtml(row.med.person)}` : ''} · ${escapeHtml(row.med.dose)}</p></div><button class="button button-primary" type="button" data-action="med-taken" data-id="${escapeHtml(row.med.id)}" data-time="${escapeHtml(row.time)}">${escapeHtml(t('✓ Το πήρα'))}</button></li>`).join('')}</ul></section>`;
  } else if (meds.length) {
    body += `<p class="subtle-empty">${escapeHtml(t('Σήμερα δεν έχει εκκρεμή δόση.'))}</p>`;
  }
  if (showForm) {
    const m = edit || { name: '', person: '', dose: '1', times: ['08:00'], quantity: '', alertBelow: 5, notes: '', doseQty: 1 };
    body += `<form class="panel settings-card" id="med-form" data-id="${escapeHtml(m.id || '')}">
      <h2>${escapeHtml(t(edit ? 'Επεξεργασία' : 'Νέο φάρμακο'))}</h2>
      <label class="field"><span class="field-label">${escapeHtml(t('Όνομα φαρμάκου'))}</span><input class="field-input" name="name" required maxlength="80" value="${escapeHtml(m.name)}"></label>
      <label class="field"><span class="field-label">${escapeHtml(t('Άτομο'))}</span><input class="field-input" name="person" maxlength="40" list="med-people" value="${escapeHtml(m.person || '')}" placeholder="${escapeHtml(t('Προαιρετικά — π.χ. για ποιον είναι.'))}"></label>
      ${people.length ? `<datalist id="med-people">${people.map((n) => `<option value="${escapeHtml(n)}">`).join('')}</datalist>` : ''}
      <label class="field"><span class="field-label">${escapeHtml(t('Δόση (ετικέτα)'))}</span><input class="field-input" name="dose" maxlength="40" value="${escapeHtml(m.dose || '1')}"></label>
      <label class="field"><span class="field-label">${escapeHtml(t('Ώρες δόσεων'))}</span><input class="field-input" name="times" value="${escapeHtml((m.times || []).join(', '))}" placeholder="${escapeHtml(t('π.χ. 08:00, 20:00'))}"></label>
      <label class="field"><span class="field-label">${escapeHtml(t('Χάπια που μένουν'))}</span><input class="field-input" name="quantity" inputmode="decimal" value="${escapeHtml(m.quantity ?? '')}"></label>
      <label class="field"><span class="field-label">${escapeHtml(t('Ειδοποίηση όταν μείνουν'))}</span><input class="field-input" name="alertBelow" inputmode="numeric" value="${escapeHtml(m.alertBelow ?? 5)}"></label>
      <label class="field"><span class="field-label">${escapeHtml(t('Σημειώσεις'))}</span><input class="field-input" name="notes" maxlength="200" value="${escapeHtml(m.notes || '')}"></label>
      <div class="dialog-actions"><button class="button button-quiet" type="button" data-action="med-cancel">${escapeHtml(t('Άκυρο'))}</button><button class="button button-primary" type="submit">${escapeHtml(t('Αποθήκευση'))}</button></div>
    </form>`;
  }
  if (!meds.length && !showForm) body += `<p class="subtle-empty">${escapeHtml(t('Δεν έχεις φάρμακα ακόμη.'))}</p>`;
  else if (meds.length) {
    body += `<section class="panel" id="meds-list"><ul class="chore-list">${meds.map((m) => {
      const taken = takenOn(m, today);
      return `<li class="chore-row"><div><strong>${escapeHtml(m.name)}</strong><p class="field-hint">${escapeHtml((m.times || []).join(', '))}${m.person ? ` · ${escapeHtml(m.person)}` : ''}${m.quantity != null ? ` · ${escapeHtml(String(m.quantity))}` : ''}${isLowStock(m) ? ` · ${escapeHtml(t('Τελειώνουν σύντομα'))}` : ''}</p>
        ${taken.length ? `<p class="field-hint">${escapeHtml(t('✓ Το πήρα'))}: ${escapeHtml(taken.join(', '))} <button class="text-button" type="button" data-action="med-undo" data-id="${escapeHtml(m.id)}" data-time="${escapeHtml(taken[taken.length - 1])}">${escapeHtml(t('Αναίρεση δόσης'))}</button></p>` : ''}</div>
        <div class="card-actions"><button class="icon-button" type="button" data-action="med-edit" data-id="${escapeHtml(m.id)}" aria-label="${escapeHtml(t('Επεξεργασία'))}">✎</button><button class="icon-button danger" type="button" data-action="med-delete" data-id="${escapeHtml(m.id)}" aria-label="${escapeHtml(t('Διαγραφή'))}">×</button></div></li>`;
    }).join('')}</ul></section>`;
  }
  return page(ctx, 'Φάρμακα', 'Δόσεις στις ώρες σου, ανά άτομο, με υπενθύμιση όταν τελειώνουν τα χάπια.', body, 'med-new', 'Νέο φάρμακο');
}

export function renderTradesPage(ctx) {
  const { t, escapeHtml, state, today, form, money, formatDate } = ctx;
  if (!isPro()) {
    return page(ctx, 'Τεχνίτες', 'Το δικό σου βιβλίο τεχνιτών του σπιτιού: τηλέφωνα, εργασίες και υπενθυμίσεις συντήρησης.',
      renderProSoon({ title: 'Τεχνίτες', t, escapeHtml }));
  }
  const people = state.tradespeople || [];
  const jobs = state.tradeJobs || [];
  const reminders = state.tradeReminders || [];
  const due = dueReminders(reminders, today, 30);
  const selected = form?.personId ? people.find((p) => p.id === form.personId) : null;
  let body = '';
  if (due.length) {
    body += `<section class="panel settings-card" id="trades-due"><span class="stat-icon amber">🛠️</span><h2>${escapeHtml(t('Λήγει σύντομα η συντήρηση'))}</h2><ul class="chore-list">${due.map((row) => `<li class="chore-row"><div><strong>${escapeHtml(row.reminder.title)}</strong><p class="field-hint">${escapeHtml(row.due)}${row.state === 'overdue' ? ` · ${escapeHtml(t('Έχει περάσει η συντήρηση'))}` : ''}</p></div><button class="button button-primary" type="button" data-action="trade-reminder-done" data-id="${escapeHtml(row.reminder.id)}">${escapeHtml(t('Το έκανα σήμερα'))}</button></li>`).join('')}</ul></section>`;
  }
  if (form?.mode === 'person' || form?.mode === 'new-person') {
    const p = form.mode === 'person' ? people.find((x) => x.id === form.id) || {} : {};
    body += `<form class="panel settings-card" id="trade-person-form" data-id="${escapeHtml(p.id || '')}">
      <h2>${escapeHtml(t(p.id ? 'Επεξεργασία' : 'Νέος τεχνίτης'))}</h2>
      <label class="field"><span class="field-label">${escapeHtml(t('Όνομα'))}</span><input class="field-input" name="name" required maxlength="80" value="${escapeHtml(p.name || '')}"></label>
      <label class="field"><span class="field-label">${escapeHtml(t('Ειδικότητα'))}</span><select class="field-input" name="specialty">${TRADE_SPECIALTIES.map((s) => `<option value="${s.id}" ${p.specialty === s.id ? 'selected' : ''}>${escapeHtml(t(s.label))}</option>`).join('')}</select></label>
      <label class="field"><span class="field-label">${escapeHtml(t('Τηλέφωνο'))}</span><input class="field-input" name="phone" maxlength="24" inputmode="tel" value="${escapeHtml(p.phone || '')}"></label>
      <label class="field"><span class="field-label">${escapeHtml(t('Σημειώσεις'))}</span><input class="field-input" name="notes" maxlength="240" value="${escapeHtml(p.notes || '')}"></label>
      <div class="dialog-actions"><button class="button button-quiet" type="button" data-action="trade-cancel">${escapeHtml(t('Άκυρο'))}</button><button class="button button-primary" type="submit">${escapeHtml(t('Αποθήκευση'))}</button></div>
    </form>`;
  }
  if (!people.length && !form) body += `<p class="subtle-empty">${escapeHtml(t('Δεν έχεις τεχνίτες ακόμη.'))}</p>`;
  else {
    body += `<section class="panel" id="trades-list"><ul class="chore-list">${people.map((p) => {
      const spec = specialtyOf(p.specialty);
      const href = telHref(p.phone);
      const call = href ? `<a class="button button-quiet" href="${escapeHtml(href)}">${escapeHtml(t('Κλήση'))}</a>` : '';
      return `<li class="chore-row"><div><strong>${escapeHtml(p.name)}</strong><p class="field-hint">${escapeHtml(spec.emoji)} ${escapeHtml(t(spec.label))}${p.specialtyLabel ? ` · ${escapeHtml(p.specialtyLabel)}` : ''}${p.phone ? ` · <span data-no-i18n>${escapeHtml(p.phone)}</span>` : ''}</p></div>
        <div class="card-actions">${call}<button class="icon-button" type="button" data-action="trade-open" data-id="${escapeHtml(p.id)}" aria-label="${escapeHtml(t('Ιστορικό εργασιών'))}">›</button><button class="icon-button" type="button" data-action="trade-edit" data-id="${escapeHtml(p.id)}">✎</button><button class="icon-button danger" type="button" data-action="trade-delete" data-id="${escapeHtml(p.id)}">×</button></div></li>`;
    }).join('')}</ul></section>`;
  }
  if (selected) {
    const spec = specialtyOf(selected.specialty);
    const href = telHref(selected.phone);
    const list = jobsFor(jobs, selected.id);
    const personReminders = reminders.filter((r) => r.tradespersonId === selected.id);
    body += `<section class="panel settings-card" id="trade-detail"><h2>${escapeHtml(selected.name)} ${proBadge()}</h2>
      <p class="field-hint">${escapeHtml(spec.emoji)} ${escapeHtml(t(spec.label))}${href ? ` · <a href="${escapeHtml(href)}">${escapeHtml(t('Κλήση'))}</a>` : ''}</p>
      <h3 class="settings-sub">${escapeHtml(t('Ιστορικό εργασιών'))}</h3>
      ${list.length ? `<ul class="waste-top">${list.map((j) => `<li><span class="product-name">${escapeHtml(formatDate ? formatDate(j.date) : j.date)} · ${escapeHtml(j.description)}</span><strong data-no-i18n>${j.cost != null ? escapeHtml(money(j.cost)) : ''}</strong><button class="icon-button danger" type="button" data-action="trade-job-delete" data-id="${escapeHtml(j.id)}">×</button></li>`).join('')}</ul>` : `<p class="subtle-empty">${escapeHtml(t('Δεν έχεις τεχνίτες ακόμη.') === 'Δεν έχεις τεχνίτες ακόμη.' ? '—' : '—')}</p>`}
      <form id="trade-job-form" data-person="${escapeHtml(selected.id)}">
        <h3 class="settings-sub">${escapeHtml(t('Νέα εργασία'))}</h3>
        <label class="field"><span class="field-label">${escapeHtml(t('Ημερομηνία'))}</span><input class="field-input" type="date" name="date" required value="${escapeHtml(today)}"></label>
        <label class="field"><span class="field-label">${escapeHtml(t('Τι έγινε'))}</span><input class="field-input" name="description" required maxlength="200"></label>
        <label class="field"><span class="field-label">${escapeHtml(t('Κόστος'))}</span><input class="field-input" name="cost" inputmode="decimal"></label>
        <div class="dialog-actions"><button class="button button-primary" type="submit">${escapeHtml(t('Αποθήκευση'))}</button></div>
      </form>
      <h3 class="settings-sub">${escapeHtml(t('Υπενθυμίσεις συντήρησης'))}</h3>
      ${personReminders.length ? `<ul class="chore-list">${personReminders.map((r) => {
        const st = reminderStatus(r, today);
        return `<li class="chore-row"><div><strong>${escapeHtml(r.title)}</strong><p class="field-hint">${st.due ? escapeHtml(st.due) : '—'}</p></div><button class="button button-quiet" type="button" data-action="trade-reminder-done" data-id="${escapeHtml(r.id)}">${escapeHtml(t('Το έκανα σήμερα'))}</button><button class="icon-button danger" type="button" data-action="trade-reminder-delete" data-id="${escapeHtml(r.id)}">×</button></li>`;
      }).join('')}</ul>` : ''}
      <form id="trade-reminder-form" data-person="${escapeHtml(selected.id)}">
        <h3 class="settings-sub">${escapeHtml(t('Νέα υπενθύμιση'))}</h3>
        <label class="field"><span class="field-label">${escapeHtml(t('Τίτλος'))}</span><input class="field-input" name="title" required maxlength="80" placeholder="${escapeHtml(t('π.χ. Ετήσιο σέρβις λέβητα'))}"></label>
        <label class="field"><span class="field-label">${escapeHtml(t('Κάθε πόσο (μήνες)'))}</span><input class="field-input" name="intervalMonths" inputmode="numeric" value="12"></label>
        <label class="field"><span class="field-label">${escapeHtml(t('Τελευταία φορά'))}</span><input class="field-input" type="date" name="lastDone"></label>
        <div class="dialog-actions"><button class="button button-primary" type="submit">${escapeHtml(t('Αποθήκευση'))}</button></div>
      </form>
    </section>`;
  }
  if (!selected && !form) {
    body += `<section class="panel settings-card" id="trade-reminders-all"><h2>${escapeHtml(t('Υπενθυμίσεις συντήρησης'))}</h2>
      <form id="trade-reminder-form">
        <label class="field"><span class="field-label">${escapeHtml(t('Τίτλος'))}</span><input class="field-input" name="title" required maxlength="80" placeholder="${escapeHtml(t('π.χ. Ετήσιο σέρβις λέβητα'))}"></label>
        <label class="field"><span class="field-label">${escapeHtml(t('Κάθε πόσο (μήνες)'))}</span><input class="field-input" name="intervalMonths" inputmode="numeric" value="12"></label>
        <label class="field"><span class="field-label">${escapeHtml(t('Τελευταία φορά'))}</span><input class="field-input" type="date" name="lastDone"></label>
        <div class="dialog-actions"><button class="button button-primary" type="submit">${escapeHtml(t('Νέα υπενθύμιση'))}</button></div>
      </form></section>`;
  }
  return page(ctx, 'Τεχνίτες', 'Το δικό σου βιβλίο τεχνιτών του σπιτιού: τηλέφωνα, εργασίες και υπενθυμίσεις συντήρησης.', body, 'trade-new', 'Νέος τεχνίτης');
}

export function renderBankPage(ctx) {
  const { t, escapeHtml, state, preview, money, formatDate } = ctx;
  if (!isPro()) {
    return page(ctx, 'Εισαγωγή κίνησης', 'Φέρε ένα αρχείο κίνησης λογαριασμού (CSV) από την τράπεζά σου. Η ανάγνωση γίνεται στη συσκευή σου — χωρίς σύνδεση στην τράπεζα.',
      renderProSoon({ title: 'Εισαγωγή κίνησης', t, escapeHtml }));
  }
  const last = ctx.lastBankBatch;
  let body = `<section class="panel settings-card" id="bank-import-card"><span class="stat-icon">🏦</span>
    <h2>${escapeHtml(t('Εισαγωγή κίνησης'))} ${proBadge()}</h2>
    <p>${escapeHtml(t('Φέρε ένα αρχείο κίνησης λογαριασμού (CSV) από την τράπεζά σου. Η ανάγνωση γίνεται στη συσκευή σου — χωρίς σύνδεση στην τράπεζα.'))}</p>
    <p class="field-hint">${escapeHtml(t('Το Excel δεν διαβάζεται ακόμη· αποθήκευσέ το ως CSV.'))}</p>
    <label class="button button-primary file-button"><span>${escapeHtml(t('Επιλογή αρχείου CSV'))}</span><input type="file" accept=".csv,text/csv,text/plain,.txt,.tsv" class="visually-hidden" id="bank-file" data-bank-file></label>
    ${last ? `<p><button class="button button-quiet" type="button" data-action="bank-undo">${escapeHtml(t('Αναίρεση τελευταίας εισαγωγής'))}</button></p>` : ''}
  </section>`;
  if (preview?.rows?.length) {
    body += `<section class="panel" id="bank-preview"><h2>${escapeHtml(t('Εισαγωγή κίνησης'))}</h2>
      <ul class="chore-list">${preview.rows.map((row, i) => {
        const status = row.status;
        const label = status === 'match' ? t('Πληρώθηκε με κάρτα') : status === 'unsure' ? t('Ίδιο έξοδο') : status === 'new' ? t('Νέο έξοδο') : t('Παράβλεψη');
        const candidate = row.candidate || (row.candidates || [])[0];
        const hint = candidate ? `${candidate.store || ''} · ${money ? money(candidate.amount) : candidate.amount}` : '';
        return `<li class="chore-row" data-bank-row="${i}"><div><strong data-no-i18n>${escapeHtml(row.row.description || '—')}</strong><p class="field-hint" data-no-i18n>${escapeHtml(formatDate ? formatDate(row.row.date) : row.row.date)} · ${escapeHtml(String(row.row.amount))}${hint ? ` · ${escapeHtml(hint)}` : ''}</p></div>
          <select class="field-input" data-bank-decision="${i}">
            <option value="match" ${status === 'match' ? 'selected' : ''} ${status === 'new' && !candidate ? 'disabled' : ''}>${escapeHtml(t('Ίδιο έξοδο'))}</option>
            <option value="new" ${status === 'new' ? 'selected' : ''}>${escapeHtml(t('Νέο έξοδο'))}</option>
            <option value="skip" ${status === 'ignored' ? 'selected' : ''}>${escapeHtml(t('Παράβλεψη'))}</option>
          </select></li>`;
      }).join('')}</ul>
      <div class="dialog-actions"><button class="button button-primary" type="button" data-action="bank-apply">${escapeHtml(t('Εφαρμογή εισαγωγής'))}</button></div>
    </section>`;
  }
  return page(ctx, 'Εισαγωγή κίνησης', 'Φέρε ένα αρχείο κίνησης λογαριασμού (CSV) από την τράπεζά σου. Η ανάγνωση γίνεται στη συσκευή σου — χωρίς σύνδεση στην τράπεζα.', body);
}

export function renderReportsPage(ctx) {
  const { t, escapeHtml, state, month, money, monthLabel, shift } = ctx;
  if (!isPro()) {
    return page(ctx, 'Αναφορές', 'Πλήρεις αναφορές και γραφήματα του μήνα. Η κάρτα «Σύνολο εξόδων» και το PDF απόδειξης μένουν δωρεάν.',
      renderProSoon({ title: 'Αναφορές', t, escapeHtml }));
  }
  const report = monthReport(state, month);
  if (!report) return page(ctx, 'Αναφορές', '', `<p class="subtle-empty">${escapeHtml(t('Κανένα έξοδο αυτόν τον μήνα ακόμη.'))}</p>`);
  const { current, previous, weeks, diff, pct, top } = report;
  const trend = !previous.total ? t('Προηγούμενος μήνας: {amount}', { amount: money(previous.total) })
    : diff > 0 ? t('▲ {amount} από τον προηγούμενο μήνα', { amount: money(diff) })
    : diff < 0 ? t('▼ {amount} από τον προηγούμενο μήνα', { amount: money(-diff) })
    : t('Ίδιο με τον προηγούμενο μήνα');
  const isCurrent = !shift || true;
  const body = `<div class="month-switch" role="group" aria-label="${escapeHtml(t('Μήνας'))}"><button class="icon-button" type="button" data-action="reports-month" data-delta="-1" aria-label="${escapeHtml(t('Προηγούμενος μήνας'))}">‹</button><strong id="reports-month" data-no-i18n>${escapeHtml(monthLabel(month))}</strong><button class="icon-button" type="button" data-action="reports-month" data-delta="1" aria-label="${escapeHtml(t('Επόμενος μήνας'))}">›</button></div>
    <section class="panel settings-card" id="reports-total"><span class="stat-icon blue">∑</span><h2>${escapeHtml(t('Αναφορές'))} ${proBadge()}</h2>
      <p class="big-number" data-no-i18n>${escapeHtml(money(current.total))}</p>
      <p class="field-hint">${escapeHtml(trend)}${pct != null ? ` (${pct > 0 ? '+' : ''}${pct}%)` : ''}</p>
      ${top.length ? svgBars(top.map((r) => ({ ...r, label: t(r.label) }))) : `<p class="subtle-empty">${escapeHtml(t('Κανένα έξοδο αυτόν τον μήνα ακόμη.'))}</p>`}
    </section>
    <section class="panel settings-card" id="reports-weeks"><h2>${escapeHtml(t('Ανά εβδομάδα'))}</h2>${svgWeekLine(weeks)}</section>
    <section class="panel settings-card" id="reports-cats"><h2>${escapeHtml(t('Ανά κατηγορία'))}</h2>
      ${top.length ? `<ul class="waste-top">${top.map((r) => `<li><span class="product-name">${escapeHtml(t(r.label))}</span><strong data-no-i18n>${escapeHtml(money(r.value))}</strong></li>`).join('')}</ul>` : `<p class="subtle-empty">${escapeHtml(t('Κανένα έξοδο αυτόν τον μήνα ακόμη.'))}</p>`}
    </section>
    <p class="field-hint">${escapeHtml(t('Πλήρεις αναφορές και γραφήματα του μήνα. Η κάρτα «Σύνολο εξόδων» και το PDF απόδειξης μένουν δωρεάν.'))}</p>`;
  return page(ctx, 'Αναφορές', 'Πλήρεις αναφορές και γραφήματα του μήνα. Η κάρτα «Σύνολο εξόδων» και το PDF απόδειξης μένουν δωρεάν.', body);
}

export function renderProSettingsCard({ t, escapeHtml, hostname, search, storage, user } = {}) {
  const on = isPro();
  const preview = isPreviewHost(hostname);
  const unlocked = previewUnlockOn({ hostname, search, storage });
  let actions = '';
  if (preview) {
    actions = on && unlocked && proSource() === 'preview'
      ? `<button class="button button-quiet" type="button" data-action="pro-preview-off">${escapeHtml(t('Κλείδωσε ξανά'))}</button>`
      : `<button class="button button-primary" type="button" data-action="pro-preview-on">${escapeHtml(t('Ξεκλείδωσε το Pro στο preview'))}</button>`;
  }
  const status = on
    ? t('Έχεις πρόσβαση Pro σε αυτή τη συσκευή.')
    : t('Συνδέσου με τον λογαριασμό κατόχου για να ξεκλειδώσεις το Pro, ή (μόνο στο preview) άνοιξέ το προσωρινά παρακάτω.');
  return `<section class="panel settings-card" id="pro-card"><span class="stat-icon">✦</span><h2>${escapeHtml(t('Σπιτοθήκη Pro'))} ${proBadge()}</h2>
    <p>${escapeHtml(t('Πρόσθετες λειτουργίες, προς το παρόν μόνο για τον κάτοχο της εφαρμογής. Αργότερα θα μπορούν να ξεκλειδωθούν με αγορά. Ό,τι είναι δωρεάν μένει δωρεάν.'))}</p>
    <p class="field-hint">${escapeHtml(status)}</p>
    ${preview ? `<p class="field-hint">${escapeHtml(t('Μόνο σε αυτή τη διεύθυνση preview, σε αυτό το κινητό ή υπολογιστή. Δεν ισχύει στο spitothiki.web.app.'))}</p><div class="settings-actions">${actions}</div>` : ''}
  </section>`;
}

export function reportsLink({ t, escapeHtml }) {
  return `<div class="settings-actions"><button class="button button-quiet" type="button" data-view="reports" id="insights-reports">${escapeHtml(t('Πλήρεις αναφορές'))} ${proBadge()}</button></div>`;
}

export function proHomeBanners({ t, escapeHtml, state, today, nowTime }) {
  if (!isPro()) return '';
  const parts = [];
  const due = allDueDoses(state.meds || [], today, nowTime);
  const low = lowStockMeds(state.meds || []);
  if (due.length || low.length) {
    const msg = due.length ? t('{count} δόσεις φαρμάκων εκκρεμούν', { count: due.length }) : t('Τελειώνουν σύντομα');
    parts.push(`<button class="alert-banner" type="button" data-view="meds">💊 ${escapeHtml(msg)} ›</button>`);
  }
  const maint = dueReminders(state.tradeReminders || [], today, 14);
  if (maint.length) {
    parts.push(`<button class="alert-banner" type="button" data-view="trades">🛠️ ${escapeHtml(t('Λήγει σύντομα η συντήρηση'))} ›</button>`);
  }
  return parts.join('');
}

function page(ctx, title, intro, body, action, actionLabel) {
  const { renderHeader, t, escapeHtml } = ctx;
  const heading = `${escapeHtml(t(title))} ${proBadge()}`;
  let head = typeof renderHeader === 'function'
    ? renderHeader(heading, t(intro), '')
    : `<header class="page-heading"><h1>${heading}</h1><p>${escapeHtml(t(intro))}</p></header>`;
  if (action && isPro()) {
    const extra = `<button class="button button-primary" type="button" data-action="${action}"><span aria-hidden="true">＋</span>${escapeHtml(t(actionLabel))}</button>`;
    if (head.includes('heading-actions')) head = head.replace('</div></header>', `${extra}</div></header>`);
    else head = head.replace('</header>', `<div class="page-actions heading-actions">${extra}</div></header>`);
  }
  return head + body;
}

export function handleProAction(action, ctx) {
  const { state, persist, renderApp, showToast, t, button, today, formRef, setForm, undoable, localNow } = ctx;
  const now = localNow || new Date().toISOString();
  if (action === 'pro-preview-on') {
    if (setPreviewUnlock(true, { hostname: ctx.hostname, storage: ctx.storage })) {
      return refreshPro(ctx.user, { hostname: ctx.hostname, search: ctx.search, storage: ctx.storage }).then(() => { renderApp(); });
    }
    return true;
  }
  if (action === 'pro-preview-off') {
    setPreviewUnlock(false, { hostname: ctx.hostname, storage: ctx.storage });
    return refreshPro(ctx.user, { hostname: ctx.hostname, search: ctx.search, storage: ctx.storage }).then(() => { renderApp(); });
  }
  if (!isPro() && /^(med-|trade-|bank-|reports-)/.test(action || '')) return true;
  if (action === 'med-new') { setForm({ mode: 'new' }); renderApp(); return true; }
  if (action === 'med-edit') { setForm({ mode: 'edit', id: button.dataset.id }); renderApp(); return true; }
  if (action === 'med-cancel') { setForm(null); renderApp(); return true; }
  if (action === 'med-delete') {
    const id = button.dataset.id;
    undoable(t('Το φάρμακο διαγράφηκε.'), () => {
      state.meds = (state.meds || []).filter((m) => m.id !== id);
      if (persist()) { renderApp(); ctx.schedule?.(); }
    });
    return true;
  }
  if (action === 'med-taken') {
    const id = button.dataset.id;
    const time = button.dataset.time;
    state.meds = (state.meds || []).map((m) => m.id === id ? markTaken(m, { date: today, time, now }) : m);
    if (persist()) { showToast(t('Καταγράφηκε η δόση.')); renderApp(); ctx.schedule?.(); }
    return true;
  }
  if (action === 'med-undo') {
    const id = button.dataset.id;
    const time = button.dataset.time;
    state.meds = (state.meds || []).map((m) => m.id === id ? undoTaken(m, { date: today, time, now }) : m);
    if (persist()) renderApp();
    return true;
  }
  if (action === 'trade-new') { setForm({ mode: 'new-person' }); renderApp(); return true; }
  if (action === 'trade-edit') { setForm({ mode: 'person', id: button.dataset.id }); renderApp(); return true; }
  if (action === 'trade-open') { setForm({ personId: button.dataset.id }); renderApp(); return true; }
  if (action === 'trade-cancel') { setForm(null); renderApp(); return true; }
  if (action === 'trade-delete') {
    const id = button.dataset.id;
    undoable(t('Ο τεχνίτης διαγράφηκε.'), () => {
      state.tradespeople = (state.tradespeople || []).filter((p) => p.id !== id);
      state.tradeJobs = (state.tradeJobs || []).filter((j) => j.tradespersonId !== id);
      state.tradeReminders = (state.tradeReminders || []).filter((r) => r.tradespersonId !== id);
      if (persist()) { renderApp(); ctx.schedule?.(); }
    });
    return true;
  }
  if (action === 'trade-job-delete') {
    const id = button.dataset.id;
    state.tradeJobs = (state.tradeJobs || []).filter((j) => j.id !== id);
    if (persist()) renderApp();
    return true;
  }
  if (action === 'trade-reminder-delete') {
    const id = button.dataset.id;
    state.tradeReminders = (state.tradeReminders || []).filter((r) => r.id !== id);
    if (persist()) renderApp();
    return true;
  }
  if (action === 'trade-reminder-done') {
    const id = button.dataset.id;
    state.tradeReminders = (state.tradeReminders || []).map((r) => r.id === id ? markReminderDone(r, today, now) : r);
    if (persist()) renderApp();
    return true;
  }
  if (action === 'bank-undo') {
    const batchId = ctx.lastBankBatch;
    if (batchId) {
      const next = undoBankImport(state, batchId);
      state.receipts = next.receipts;
      state.extras = next.extras;
      state.transport = next.transport;
      ctx.setLastBankBatch(null);
      if (persist()) { showToast(t('Η εισαγωγή αναιρέθηκε.')); renderApp(); }
    }
    return true;
  }
  if (action === 'bank-apply') {
    const preview = ctx.bankPreview;
    if (!preview?.rows?.length) { showToast(t('Καμία κίνηση για εισαγωγή.')); return true; }
    const decisions = preview.rows.map((row, i) => {
      const sel = document.querySelector(`[data-bank-decision="${i}"]`)?.value || row.status;
      if (sel === 'skip') return { status: 'ignored', row: row.row };
      if (sel === 'new') return { status: 'new', row: row.row };
      return { status: 'match', row: row.row, candidate: row.candidate || (row.candidates || [])[0] };
    });
    const next = applyBankImport(state, decisions, { now });
    state.receipts = next.receipts;
    state.extras = next.extras;
    state.transport = next.transport;
    ctx.setLastBankBatch(next.batchId);
    ctx.setBankPreview(null);
    if (persist()) { showToast(t('Η εισαγωγή εφαρμόστηκε. Μπορείς να την αναιρέσεις.')); renderApp(); }
    return true;
  }
  if (action === 'reports-month') {
    const delta = Number(button.dataset.delta) || 0;
    ctx.shiftReportsMonth?.(delta);
    renderApp();
    return true;
  }
  return false;
}

export function saveMedForm(form, { state, persist, renderApp, setForm, showToast, t, now }) {
  try {
    const existing = form.dataset.id ? (state.meds || []).find((m) => m.id === form.dataset.id) : null;
    const rec = createMed({
      ...(existing || {}),
      id: existing?.id,
      name: form.elements.name.value,
      person: form.elements.person.value,
      dose: form.elements.dose.value,
      times: form.elements.times.value,
      quantity: form.elements.quantity.value,
      alertBelow: form.elements.alertBelow.value,
      notes: form.elements.notes.value,
      taken: existing?.taken
    }, now);
    state.meds = existing ? (state.meds || []).map((m) => m.id === rec.id ? rec : m) : [...(state.meds || []), rec];
    setForm(null);
    if (persist()) renderApp();
  } catch (err) {
    showToast(t(err.message || 'Σφάλμα'));
  }
}

export function saveTradePersonForm(form, { state, persist, renderApp, setForm, showToast, t, now }) {
  try {
    const existing = form.dataset.id ? (state.tradespeople || []).find((p) => p.id === form.dataset.id) : null;
    const rec = createTradesperson({ ...(existing || {}), id: existing?.id, name: form.elements.name.value, specialty: form.elements.specialty.value, phone: form.elements.phone.value, notes: form.elements.notes.value }, now);
    state.tradespeople = existing ? state.tradespeople.map((p) => p.id === rec.id ? rec : p) : [...(state.tradespeople || []), rec];
    setForm({ personId: rec.id });
    if (persist()) renderApp();
  } catch (err) {
    showToast(t(err.message || 'Σφάλμα'));
  }
}

export function saveTradeJobForm(form, ctx) {
  try {
    const rec = createTradeJob({ tradespersonId: form.dataset.person, date: form.elements.date.value, description: form.elements.description.value, cost: form.elements.cost.value }, ctx.now);
    ctx.state.tradeJobs = [...(ctx.state.tradeJobs || []), rec];
    if (ctx.persist()) ctx.renderApp();
  } catch (err) {
    ctx.showToast(ctx.t(err.message || 'Σφάλμα'));
  }
}

export function saveTradeReminderForm(form, ctx) {
  try {
    const rec = createTradeReminder({ title: form.elements.title.value, intervalMonths: form.elements.intervalMonths.value, lastDone: form.elements.lastDone.value, tradespersonId: form.dataset.person || '' }, ctx.now);
    ctx.state.tradeReminders = [...(ctx.state.tradeReminders || []), rec];
    if (ctx.persist()) ctx.renderApp();
  } catch (err) {
    ctx.showToast(ctx.t(err.message || 'Σφάλμα'));
  }
}

export async function loadBankFile(file, ctx) {
  try {
    const text = await file.text();
    const rows = parseBankCsv(text);
    const matched = matchBankRows(rows, { receipts: ctx.state.receipts || [], extras: ctx.state.extras || [], transport: ctx.state.transport || [] });
    ctx.setBankPreview({ rows: matched });
    ctx.renderApp();
  } catch (err) {
    ctx.showToast(ctx.t(err.message || 'Σφάλμα'));
  }
}

export const PRO_PAGES_EN = {
  'Σήμερα': 'Today',
  'Επεξεργασία': 'Edit',
  'Διαγραφή': 'Delete',
  'Ημερομηνία': 'Date',
  'Τίτλος': 'Title',
  'Μήνας': 'Month',
  'Προηγούμενος μήνας': 'Previous month',
  'Επόμενος μήνας': 'Next month',
  'Προηγούμενος μήνας: {amount}': 'Previous month: {amount}',
  '{count} δόσεις φαρμάκων εκκρεμούν': '{count} medication doses are due',
  'Σφάλμα': 'Error'
};
