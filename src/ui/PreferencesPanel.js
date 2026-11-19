/** UI / src/ui/PreferencesPanel.js: "Minha cidade e renda" section of the settings panel. */

/**
 * @param {Object} deps
 * @param {import('../application/PreferencesService.js?v=20261119-1136').PreferencesService} deps.preferences
 * @param {import('./PriceMonitorView.js?v=20261119-1136').PriceMonitorView} deps.view
 */
export function preferencesSection({ preferences, view }) {
  return {
    titulo: 'Minha cidade e renda',
    montar(body) {
      const doc = body.ownerDocument;

      const field = doc.createElement('label');
      field.className = 'stk-config-campo';
      field.textContent = 'Capital ao abrir o app';
      const select = doc.createElement('select');
      select.id = 'prefCapital';
      select.add(new Option('Padrão do app (São Paulo)', ''));
      view.capitalChoices().forEach(({ code, label }) => select.add(new Option(label, String(code))));
      select.value = String(preferences.preferredCapital() ?? '');
      select.addEventListener('change', () => {
        const code = select.value === '' ? null : Number(select.value);
        preferences.setPreferredCapital(code);
        view.selectCapital(code);
      });
      field.append(select);

      const remember = doc.createElement('label');
      remember.className = 'stk-config-marcar';
      const check = doc.createElement('input');
      check.type = 'checkbox';
      check.id = 'prefRememberWage';
      check.checked = preferences.isRememberingWage();
      check.addEventListener('change', () => preferences.setRememberWage(check.checked, view.typedWage()));
      remember.append(check, 'Lembrar minha renda neste aparelho');

      const note = doc.createElement('p');
      note.className = 'stk-config-texto';
      note.textContent = 'A renda fica só neste navegador. Em aparelho compartilhado, deixe desmarcado.';

      body.append(field, remember, note);
    },
  };
}
