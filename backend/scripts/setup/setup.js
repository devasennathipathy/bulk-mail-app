const form = document.getElementById('setup-form');
const result = document.getElementById('result');
let running = false;
async function configure(action) {
  if (running) return;
  if (action !== 'database' && !form.reportValidity()) return;
  running = true;
  const buttons = [...form.querySelectorAll('button')];
  buttons.forEach(button => { button.disabled = true; });
  result.hidden = false;
  result.className = '';
  result.textContent = action === 'deploy' ? 'Checking MongoDB and SMTP, saving secrets, and deploying… This may take a few minutes.' : 'Checking connections…';
  try {
    const response = await fetch('/configure', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Setup-Token': document.querySelector('meta[name=csrf-token]').content },
      body: JSON.stringify({ ...Object.fromEntries(new FormData(form)), action }),
    });
    const data = await response.json();
    result.textContent = data.message;
    result.className = response.ok ? 'success' : 'error';
    if (data.deployed) {
      document.getElementById('password').value = '';
      document.getElementById('smtpPassword').value = '';
      document.getElementById('app-link').hidden = false;
    }
  } catch { result.className = 'error'; result.textContent = 'Cannot reach local setup. Keep npm run configure running and check Vercel before retrying a deployment.'; }
  finally { buttons.forEach(button => { button.disabled = false; }); running = false; }
}
form.addEventListener('submit', event => { event.preventDefault(); configure('deploy'); });
document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => configure(button.dataset.action)));
