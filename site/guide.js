const $ = selector => document.querySelector(selector);
let mode = 'aws';
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const isIPv4 = value => /^\d{1,3}(\.\d{1,3}){3}$/.test(value) && value.split('.').every(part => Number(part) <= 255);
const publicIPv4 = () => $('#ssh-cidr').value.trim().replace(/\/32$/, '');

function updateCommands() {
  $('#command-status').textContent = 'Run these on your computer, inside the downloaded farcaster-bounty folder.';
  $('#command-status').classList.remove('error');
  const ip = publicIPv4();
  const host = $('#ssh-host').value.trim();
  const key = $('#ssh-key').value.trim();
  const region = $('#aws-region').value.trim();
  const profile = $('#aws-profile').value.trim();
  const subnet = $('#aws-subnet').value.trim();
  const directory = $('#remote-dir').value.trim();
  const options = (region !== 'us-east-1' ? ` --region ${quote(region)}` : '') + (profile ? ` --profile ${quote(profile)}` : '') + (subnet ? ` --subnet-id ${quote(subnet)}` : '');
  const provision = `./relay provision --ack-costs --ssh-cidr ${isIPv4(ip) ? ip : 'YOUR_IP'}/32${options}`;
  $('#overview-provision-command').textContent = isIPv4(ip) ? provision : 'Fill in your IP in step 2 to generate command 1';
  $('#provision-command').textContent = mode === 'aws'
    ? provision
    : `./relay provision --existing-host ${host || 'ubuntu@YOUR_SERVER'} --key ${quote(key || '~/.ssh/id_ed25519')}${directory !== '/opt/snapchain' ? ` --remote-dir ${quote(directory)}` : ''}`;
  $('#dry-run-command').textContent = `${provision} --dry-run`;
  $('#first-step-title').textContent = mode === 'aws' ? 'Create the server' : 'Connect your server';
  $('#provision-description').textContent = mode === 'aws'
    ? `Creates the server in ${region || 'your selected region'} and saves its details in .relay-state/. AWS billing starts here. Wait for “Host ready:” and for your terminal prompt to return.`
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
  if (needsIPv4) {
    const region = $('#aws-region').value.trim();
    const profile = $('#aws-profile').value.trim();
    const subnet = $('#aws-subnet').value.trim();
    if (!/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(region) || profile.length > 128 || /[\r\n\0]/.test(profile) || (subnet && !/^subnet-(?:[a-f0-9]{8}|[a-f0-9]{17})$/.test(subnet))) {
      $('#command-status').textContent = 'Check the optional settings: enter a valid AWS region, a single-line profile name and a subnet ID if supplied.';
      $('#command-status').classList.add('error');
      $('#aws-fields details').open = true;
      return;
    }
  }
  if (id === 'provision-command' && mode === 'existing') {
    const directory = $('#remote-dir').value.trim();
    if (!/^\/[A-Za-z0-9_./-]+$/.test(directory) || directory === '/' || directory.split('/').includes('..')) {
      $('#command-status').textContent = 'Enter the existing node’s absolute directory, without .. or shell characters.';
      $('#command-status').classList.add('error');
      $('#remote-dir').focus();
      return;
    }
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
      : ['clone-command', 'local-clone-command', 'fresh-clone-command'].includes(id) ? 'Commands copied. Run them on your computer, in the folder where you keep projects.'
      : 'Command copied. Run it in the project folder.');
    $('#command-status').classList.remove('error');
  } catch (error) { announce(error.message); }
});
updateCommands();

let hosting = 'aws';
function selectHosting(value) {
  hosting = value;
  const url = new URL(location.href);url.searchParams.set('hosting',hosting);history.replaceState(null,'',url);
  for (const tab of document.querySelectorAll('[data-hosting]')) {
    const active = tab.dataset.hosting === hosting;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    document.getElementById(tab.getAttribute('aria-controls')).hidden = !active;
  }
  for (const element of document.querySelectorAll('[data-hosting-only]')) element.hidden = element.dataset.hostingOnly !== hosting;
  for (const link of document.querySelectorAll('[data-setup-jump]')) link.href = hosting === 'local' ? '#local-setup' : '#prerequisites';
  $('#hosting-status').textContent = hosting === 'local' ? 'Your computer: node and client run locally. No AWS account or cloud server.' : 'AWS: both services run on the rented server.';
}
wireTabs('[data-hosting]', tab => selectHosting(tab.dataset.hosting));
selectHosting(new URLSearchParams(location.search).get('hosting') === 'local' || location.hash.startsWith('#local-') ? 'local' : 'aws');

// These are teaching sequences. They make no API calls and publish no messages.
for (const demo of document.querySelectorAll('.flow-demo')) {
  const steps = [...demo.querySelectorAll('.flow-step')];
  const notes = [...demo.querySelectorAll('[data-flow-note]')];
  const play = demo.querySelector('[data-flow-play]');
  const progress = demo.querySelector('.flow-progress');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let index = 0;
  let timer;
  function stop() {
    clearTimeout(timer);
    timer = undefined;
    demo.classList.remove('is-playing');
    play.textContent = 'Play example';
    play.setAttribute('aria-pressed', 'false');
  }
  function show(next) {
    index = next;
    steps.forEach((step, i) => {
      if (i === index) step.setAttribute('aria-current', 'step');
      else step.removeAttribute('aria-current');
    });
    notes.forEach((note, i) => { note.hidden = i !== index; });
    progress.textContent = `Step ${index + 1} of ${steps.length}`;
  }
  function advance() {
    if (index === steps.length - 1) { stop(); return; }
    show(index + 1);
    if (index === steps.length - 1) stop();
    else timer = setTimeout(advance, 5000);
  }
  play.addEventListener('click', () => {
    if (timer) { stop(); return; }
    if (index === steps.length - 1) show(0);
    demo.classList.add('is-playing');
    play.textContent = 'Pause example';
    play.setAttribute('aria-pressed', 'true');
    timer = setTimeout(advance, 5000);
  });
  demo.querySelector('[data-flow-next]').addEventListener('click', () => { stop(); show((index + 1) % steps.length); });
  steps.forEach((step, i) => step.querySelector('button').addEventListener('click', () => { stop(); show(i); }));
  // Pause instead of letting an unseen sequence advance while the reader is elsewhere.
  const observer = new IntersectionObserver(entries => { if (!entries[0].isIntersecting) stop(); });
  observer.observe(demo);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  reduced.addEventListener('change', stop);
  play.setAttribute('aria-pressed', 'false');
  demo.querySelector('.flow-controls').hidden = false;
}
