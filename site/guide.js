const $ = selector => document.querySelector(selector);
let mode = 'aws';
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const isIPv4 = value => /^\d{1,3}(\.\d{1,3}){3}$/.test(value) && value.split('.').every(part => Number(part) <= 255);
const publicIPv4 = () => $('#ssh-cidr').value.trim().replace(/\/32$/, '');

function updateCommands() {
  $('#command-status').textContent = 'Run these from the repository folder on your computer.';
  $('#command-status').classList.remove('error');
  const ip = publicIPv4();
  const host = $('#ssh-host').value.trim();
  const key = $('#ssh-key').value.trim();
  const provision = `./relay provision --ack-costs --ssh-cidr ${isIPv4(ip) ? ip : 'YOUR_IP'}/32`;
  $('#provision-command').textContent = mode === 'aws'
    ? provision
    : `./relay provision --existing-host ${host || 'ubuntu@YOUR_SERVER'} --key ${quote(key || '~/.ssh/id_ed25519')}`;
  $('#dry-run-command').textContent = `${provision} --dry-run`;
  $('#first-step-title').textContent = mode === 'aws' ? 'Create the server' : 'Connect your existing node';
  $('#provision-description').textContent = mode === 'aws'
    ? 'Creates paid AWS resources in us-east-1 by default. Saves server details and the private SSH key in .relay-state/. Wait for “Host ready” before starting Snapchain.'
    : 'Records your existing host and key path. The next command checks the node; the client installs separately beside it.';
  $('#node-description').textContent = mode === 'aws'
    ? 'Installs Docker and starts the pinned node. Snapshot restore begins on the server. Wait for “Snapshot restore started,” then run the client command; you do not need to wait for full sync first.'
    : 'Reads the existing node’s status. Does not install software, replace configuration or restart it.';
  $('#aws-fields').hidden = mode !== 'aws';
  $('#existing-fields').hidden = mode !== 'existing';
  $('#setup-fields').setAttribute('aria-labelledby', mode === 'aws' ? 'aws-tab' : 'existing-tab');
  for (const tab of document.querySelectorAll('[data-mode]')) {
    const selected = tab.dataset.mode === mode;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
}

function wireTabs(selector, select) {
  const tabs = [...document.querySelectorAll(selector)];
  for (const tab of tabs) {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const index = tabs.indexOf(tab);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      select(tabs[next]);
      tabs[next].focus();
    });
  }
}
wireTabs('[data-mode]', tab => { mode = tab.dataset.mode; updateCommands(); });
wireTabs('[data-path]', selected => {
  for (const tab of document.querySelectorAll('[data-path]')) {
    const active = tab === selected;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    document.getElementById(tab.getAttribute('aria-controls')).hidden = !active;
  }
});
for (const input of document.querySelectorAll('#setup-fields input')) input.addEventListener('input', updateCommands);

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.top = '-1000px';
  document.body.append(field);
  field.select();
  const copied = document.execCommand('copy');
  field.remove();
  if (!copied) throw new Error('Select the command and copy it manually.');
}
let toastTimer;
function announce(text) {
  const toast = $('.clipboard-status');
  toast.textContent = text;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3000);
}
for (const button of document.querySelectorAll('[data-copy]')) button.addEventListener('click', async () => {
  const id = button.dataset.copy;
  const needsIPv4 = id === 'dry-run-command' || (id === 'provision-command' && mode === 'aws');
  if (needsIPv4 && !isIPv4(publicIPv4())) {
    $('#command-status').textContent = 'Enter your public IPv4 above, then copy the command.';
    $('#command-status').classList.add('error');
    if (mode !== 'aws') { mode = 'aws'; updateCommands(); $('#command-status').textContent = 'Enter your public IPv4 above, then copy the command.'; $('#command-status').classList.add('error'); }
    $('#ssh-cidr').focus();
    return;
  }
  if (id === 'provision-command' && mode === 'existing'
    && (!/^[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+$/.test($('#ssh-host').value.trim()) || !$('#ssh-key').value.trim())) {
    $('#command-status').textContent = 'Enter a user@hostname SSH target and a local private-key path.';
    $('#command-status').classList.add('error');
    $('#ssh-host').focus();
    return;
  }
  try {
    await copyText(document.getElementById(id).textContent);
    announce(button.dataset.runOn === 'server' ? 'Command copied. Run it on your server over SSH.' : 'Command copied. Run it in your local repository folder.');
    $('#command-status').classList.remove('error');
  } catch (error) { announce(error.message); }
});
const chapterLinks = [...document.querySelectorAll('.chapter-rail nav a')];
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      for (const link of chapterLinks) {
        if (link.hash === '#' + entry.target.id) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      }
    }
  }, {rootMargin: '-90px 0px -62% 0px', threshold: 0});
  for (const section of document.querySelectorAll('main section[id]')) observer.observe(section);
}
for (const link of document.querySelectorAll('.mobile-chapters a')) link.addEventListener('click', () => { $('.mobile-chapters').open = false; });
updateCommands();
