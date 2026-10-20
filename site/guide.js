const $ = selector => document.querySelector(selector);
let mode = 'aws';
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const isIPv4 = value => /^\d{1,3}(\.\d{1,3}){3}$/.test(value) && value.split('.').every(part => Number(part) <= 255);
function updateCommands() {
  $('#command-status').textContent = 'Run these from the repository folder on your computer.';
  $('#command-status').classList.remove('error');
  const ip = $('#ssh-cidr').value.trim().replace(/\/32$/, '');
  const host = $('#ssh-host').value.trim();
  const key = $('#ssh-key').value.trim();
  $('#provision-command').textContent = mode === 'aws'
    ? `./relay provision --ack-costs --ssh-cidr ${isIPv4(ip) ? ip : 'YOUR_IP'}/32`
    : `./relay provision --existing-host ${host || 'ubuntu@YOUR_SERVER'} --key ${quote(key || '~/.ssh/id_ed25519')}`;
  $('#first-step-title').textContent = mode === 'aws' ? 'Provision compute' : 'Connect your server';
  $('#aws-fields').hidden = mode !== 'aws';
  $('#existing-fields').hidden = mode !== 'existing';
  $('#setup-fields').setAttribute('aria-labelledby', mode === 'aws' ? 'aws-tab' : 'existing-tab');
  for (const tab of document.querySelectorAll('[data-mode]')) tab.setAttribute('aria-selected', String(tab.dataset.mode === mode));
}
for (const tab of document.querySelectorAll('[data-mode]')) tab.addEventListener('click', () => { mode = tab.dataset.mode; updateCommands(); });
for (const input of document.querySelectorAll('#setup-fields input')) input.addEventListener('input', updateCommands);
for (const tab of document.querySelectorAll('[data-mode]')) tab.addEventListener('keydown', event => {
  if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
    event.preventDefault(); mode = event.key === 'Home' ? 'aws' : event.key === 'End' ? 'existing' : mode === 'aws' ? 'existing' : 'aws'; updateCommands(); document.querySelector(`[data-mode="${mode}"]`).focus();
  }
});
async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  const field = document.createElement('textarea'); field.value = text; field.setAttribute('readonly',''); field.style.position = 'fixed'; field.style.top = '-1000px'; document.body.append(field); field.select();
  const copied = document.execCommand('copy'); field.remove(); if (!copied) throw new Error('Select the command and copy it manually.');
}
let toastTimer;
function announce(text) { const toast = $('.clipboard-status'); toast.textContent = text; toast.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('visible'), 3000); }
for (const button of document.querySelectorAll('[data-copy]')) button.addEventListener('click', async () => {
  if (button.dataset.copy === 'provision-command') {
    if (mode === 'aws' && !isIPv4($('#ssh-cidr').value.trim().replace(/\/32$/, ''))) { $('#command-status').textContent = 'Enter your current public IPv4 first. Preview the plan before paying for compute.'; $('#command-status').classList.add('error'); $('#ssh-cidr').focus(); return; }
    if (mode === 'existing' && (!/^[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+$/.test($('#ssh-host').value.trim()) || !$('#ssh-key').value.trim())) { $('#command-status').textContent = 'Enter a user@hostname SSH target and local private-key path.'; $('#command-status').classList.add('error'); $('#ssh-host').focus(); return; }
  }
  try { await copyText(document.getElementById(button.dataset.copy).textContent); announce('Command copied. Run it in your local repository folder.'); $('#command-status').classList.remove('error'); }
  catch (error) { announce(error.message); }
});
const chapterLinks = [...document.querySelectorAll('.chapter-rail nav a')];
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => { for (const entry of entries) if (entry.isIntersecting) { for (const link of chapterLinks) { if (link.hash === '#' + entry.target.id) link.setAttribute('aria-current','location'); else link.removeAttribute('aria-current'); } } }, {rootMargin:'-90px 0px -62% 0px',threshold:0});
  for (const section of document.querySelectorAll('main section[id], #commands')) observer.observe(section);
}
for (const link of document.querySelectorAll('.mobile-chapters a')) link.addEventListener('click', () => $('.mobile-chapters').open = false);
updateCommands();
