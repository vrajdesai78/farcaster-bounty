const $ = selector => document.querySelector(selector);
let mode = 'aws';
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const isIPv4 = value => /^\d{1,3}(\.\d{1,3}){3}$/.test(value) && value.split('.').every(part => Number(part) <= 255);
const publicIPv4 = () => $('#ssh-cidr').value.trim().replace(/\/32$/, '');

function updateCommands() {
  $('#command-status').textContent = 'Run these in the project folder on your computer.';
  $('#command-status').classList.remove('error');
  const ip = publicIPv4();
  const host = $('#ssh-host').value.trim();
  const key = $('#ssh-key').value.trim();
  const provision = `./relay provision --ack-costs --ssh-cidr ${isIPv4(ip) ? ip : 'YOUR_IP'}/32`;
  $('#provision-command').textContent = mode === 'aws'
    ? provision
    : `./relay provision --existing-host ${host || 'ubuntu@YOUR_SERVER'} --key ${quote(key || '~/.ssh/id_ed25519')}`;
  $('#dry-run-command').textContent = `${provision} --dry-run`;
  $('#first-step-title').textContent = mode === 'aws' ? 'Create the server' : 'Connect your server';
  $('#provision-description').textContent = mode === 'aws'
    ? 'Creates the server in us-east-1 and saves its details in .relay-state/. AWS billing starts here. Wait for “Host ready”.'
    : 'Saves your server and key path. Nothing is installed yet.';
  $('#node-description').textContent = mode === 'aws'
    ? 'Installs Docker, starts the node and begins the snapshot restore. After “Snapshot restore started”, you can install the client while the node restores in the background.'
    : 'Checks your node’s status. It doesn’t install, reconfigure or restart anything.';
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
    if (mode !== 'aws') { mode = 'aws'; updateCommands(); }
    $('#command-status').textContent = 'Enter your public IP address above first.';
    $('#command-status').classList.add('error');
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
    announce(button.dataset.runOn === 'server' ? 'Command copied. Run it on your server over SSH.'
      : ['clone-command', 'quickstart-clone-command'].includes(id) ? 'Commands copied. Run them on your computer, in the folder where you keep projects.'
      : 'Command copied. Run it in the project folder.');
    $('#command-status').classList.remove('error');
  } catch (error) { announce(error.message); }
});
updateCommands();
