/* ---------------- supabase client ---------------- */
const SUPABASE_URL = 'https://ndtwhvzhlmewlufxyyyb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_m_3Tc9WAxT7uzzY9O0Sqsw_PAwgs1o0';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentProfile = null;   // { id(uuid), player_id, name, email, theme, kyc_verified }
let currentRoom = null;      // { id, code, seats, current_turn, last_roll }
let roomChannel = null;

/* ---------------- profile ---------------- */
function loadUserIntoApp(){
  const p = currentProfile;
  if(!p) return;
  document.getElementById('topbar-uid').textContent = 'ID ' + p.player_id;
  document.getElementById('topbar-balance').textContent = 'Rs ' + Number(p.balance||0).toLocaleString();
  document.getElementById('profile-uid').textContent = 'ID ' + p.player_id;
  document.getElementById('profile-name').textContent = p.name || 'Player';
  document.getElementById('profile-avatar').textContent = (p.name||'P').trim().charAt(0).toUpperCase();
  updateKycUI(p);
  setTheme(p.theme || 'light', false);
}

function updateKycUI(p){
  const pill = document.getElementById('kyc-pill');
  const sub = document.getElementById('withdraw-sub');
  if(p.kyc_verified){
    pill.textContent = '● KYC verified';
    pill.classList.remove('no'); pill.classList.add('yes');
    sub.textContent = 'Cash out your winnings';
    document.getElementById('kyc-form-wrap').classList.add('hidden');
    document.getElementById('kyc-done-wrap').classList.remove('hidden');
  } else {
    pill.textContent = '● KYC not verified';
    pill.classList.remove('yes'); pill.classList.add('no');
    sub.textContent = 'Locked — complete KYC first';
    document.getElementById('kyc-form-wrap').classList.remove('hidden');
    document.getElementById('kyc-done-wrap').classList.add('hidden');
  }
}

async function submitKyc(){
  const surname = document.getElementById('kyc-surname').value.trim();
  const lastname = document.getElementById('kyc-lastname').value.trim();
  const age = document.getElementById('kyc-age').value.trim();
  const location = document.getElementById('kyc-location').value.trim();
  const doc = document.getElementById('kyc-doc').value.trim();
  const err = document.getElementById('kyc-error');
  if(!surname || !lastname || !age || !location || !doc){ err.style.display='block'; return; }
  err.style.display='none';

  const uid = currentProfile.id;
  const { error: kycErr } = await sb.from('kyc_submissions').insert({
    user_id: uid, surname, last_name: lastname, age: Number(age), location, document_number: doc
  });
  if(kycErr){ err.textContent = kycErr.message; err.style.display='block'; return; }

  const { data: updated, error: upErr } = await sb.from('profiles')
    .update({ kyc_verified: true }).eq('id', uid).select().single();
  if(upErr){ err.textContent = upErr.message; err.style.display='block'; return; }

  currentProfile = updated;
  updateKycUI(currentProfile);
  addHistoryEvent('✅','KYC verification approved', null);
}


/* ---------------- theme ---------------- */
async function setTheme(theme, persist=true){
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelectorAll('.theme-swatch').forEach(el=>{
    el.classList.toggle('active', el.dataset.theme===theme);
  });
  if(persist && currentProfile){
    currentProfile.theme = theme;
    const { data, error } = await sb.from('profiles').update({ theme }).eq('id', currentProfile.id).select().single();
    if(!error) currentProfile = data;
  }
}


/* ---------------- navigation ---------------- */
function goto(pageId){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b=>{
    b.classList.toggle('active', b.dataset.page===pageId ||
      (['page-settings','page-deposit','page-withdraw','page-support','page-leaderboard'].includes(pageId) && b.dataset.page==='page-profile'));
  });
  if(pageId==='page-withdraw'){
    const verified = currentProfile && currentProfile.kyc_verified;
    document.getElementById('withdraw-locked').classList.toggle('hidden', !!verified);
    document.getElementById('withdraw-open').classList.toggle('hidden', !verified);
    document.getElementById('withdraw-code-box').classList.add('hidden');
    document.getElementById('withdraw-amount').value = '';
    document.getElementById('withdraw-confirm-btn').disabled = false;
  }
  if(pageId==='page-tournaments') renderTournaments();
  if(pageId==='page-support') renderSupport();
  if(pageId==='page-notifications') renderNotifications();
  if(pageId==='page-leaderboard') renderLeaderboard();
  if(pageId==='page-profile') renderPlayerStats();
  if(pageId==='page-settings' && currentProfile){
    document.getElementById('edit-name-input').value = currentProfile.name || '';
  }
  window.scrollTo({top:0, behavior:'smooth'});
}
function goHome(){ goto('page-home'); }


/* ---------------- live wallet balance ---------------- */
function subscribeToProfile(){
  if(!currentProfile) return;
  sb.channel('profile-'+currentProfile.id)
    .on('postgres_changes', { event:'UPDATE', schema:'public', table:'profiles', filter:`id=eq.${currentProfile.id}` },
      (payload) => { currentProfile = payload.new; loadUserIntoApp(); })
    .subscribe();
}


/* ---------------- display name ---------------- */
async function saveDisplayName(){
  const name = document.getElementById('edit-name-input').value.trim();
  if(!name){ alert('Enter a display name.'); return; }
  const { data, error } = await sb.from('profiles').update({ name }).eq('id', currentProfile.id).select().single();
  if(error){ alert(error.message); return; }
  currentProfile = data;
  loadUserIntoApp();
  alert('Display name updated.');
}


/* ---------------- player stats ---------------- */
async function renderPlayerStats(){
  if(!currentProfile) return;
  document.getElementById('stat-balance').textContent = Number(currentProfile.balance||0).toLocaleString();
  const { data } = await sb.from('leaderboard').select('*').eq('id', currentProfile.id).maybeSingle();
  document.getElementById('stat-wins').textContent = data ? data.wins : 0;
  document.getElementById('stat-tournaments').textContent = data ? data.tournaments_played : 0;
}

/* ---------------- captcha ---------------- */
let captchaVerified = false;
function runCaptcha(){
  if(captchaVerified) return;
  const box = document.getElementById('captcha-check');
  const label = document.getElementById('captcha-label');
  box.classList.add('checking');
  label.textContent = 'Verifying…';
  setTimeout(()=>{
    box.classList.remove('checking');
    box.classList.add('done');
    label.textContent = "Verified — you're human";
    captchaVerified = true;
  }, 900);
}


/* ---------------- login / signup ---------------- */
function showSignup(){
  document.getElementById('form-login').classList.add('hidden');
  document.getElementById('form-signup').classList.remove('hidden');
}
function showLogin(){
  document.getElementById('form-signup').classList.add('hidden');
  document.getElementById('form-login').classList.remove('hidden');
}

async function handleSignup(){
  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const pass = document.getElementById('signup-password').value;
  const err = document.getElementById('signup-error');
  if(!name || !email || !pass){ err.textContent='Please fill in every field.'; err.style.display='block'; return; }

  const btn = event.target; btn.disabled = true; btn.textContent = 'Creating account…';
  const { data, error } = await sb.auth.signUp({
    email, password: pass, options: { data: { name } }
  });
  btn.disabled = false; btn.textContent = 'Create account';

  if(error){ err.textContent = error.message; err.style.display='block'; return; }
  err.style.display='none';

  if(data.session){
    await loginFlow();
  } else {
    // email confirmation is turned on for this project
    err.style.color = 'var(--teal)';
    err.textContent = 'Account created! Check your email to confirm it, then log in.';
    err.style.display='block';
    showLogin();
  }
}

async function handleLogin(){
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-password').value;
  const err = document.getElementById('login-error');
  if(!email || !pass || !captchaVerified){
    err.textContent = 'Please fill in your email, password and confirm the captcha.';
    err.style.display='block'; return;
  }

  const btn = event.target; btn.disabled = true; btn.textContent = 'Logging in…';
  const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
  btn.disabled = false; btn.textContent = 'Log in with Email';

  if(error){ err.textContent = error.message; err.style.display='block'; return; }
  err.style.display='none';
  await loginFlow();
}

async function loginFlow(){
  const { data:{ user } } = await sb.auth.getUser();
  if(!user) return;
  const { data: profile, error } = await sb.from('profiles').select('*').eq('id', user.id).single();
  if(error || !profile){
    document.getElementById('login-error').textContent = 'Could not load your profile — try again.';
    document.getElementById('login-error').style.display='block';
    return;
  }
  if(profile.blocked){
    document.getElementById('login-error').textContent = 'This account has been blocked. Contact support for help.';
    document.getElementById('login-error').style.display='block';
    await sb.auth.signOut();
    return;
  }
  currentProfile = profile;
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').classList.add('active');
  loadUserIntoApp();
  await renderHistory();
  startHeartbeat();
  subscribeToProfile();
  checkTournamentBadge();
  checkNotifDot();
  goto('page-home');
}

function startHeartbeat(){
  const beat = async () => {
    if(!currentProfile) return;
    await sb.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', currentProfile.id);
  };
  beat();
  setInterval(beat, 45000);
}


/* ---------------- forgot password ---------------- */
async function forgotPassword(){
  const email = document.getElementById('login-email').value.trim();
  const err = document.getElementById('login-error');
  if(!email){ err.textContent='Enter your email above first, then tap "Forgot your password?".'; err.style.display='block'; return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.href });
  if(error){ err.textContent = error.message; err.style.display='block'; return; }
  err.style.color = 'var(--teal)';
  err.textContent = 'Password reset link sent — check your email inbox.';
  err.style.display='block';
}

/* ---------------- deposit / withdraw ---------------- */
function copyHandle(){
  navigator.clipboard?.writeText('@paidnpr');
  const btn = event.target; const old = btn.textContent;
  btn.textContent = 'Copied!'; setTimeout(()=>btn.textContent=old, 1200);
}
function copyRoom(){
  const code = document.getElementById('room-code').textContent;
  navigator.clipboard?.writeText(code);
  const btn = event.target; const old = btn.textContent;
  btn.textContent = 'Copied!'; setTimeout(()=>btn.textContent=old, 1200);
}
function randomCode(len=5){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let out='';
  for(let i=0;i<len;i++) out += chars[Math.floor(Math.random()*chars.length)];
  return out;
}
async function confirmWithdraw(){
  const amt = document.getElementById('withdraw-amount').value;
  const err = document.getElementById('withdraw-error');
  if(!amt || Number(amt)<=0){ err.style.display='block'; return; }
  err.style.display='none';
  const code = randomCode(5);

  const { error } = await sb.from('withdrawals').insert({
    user_id: currentProfile.id, amount: Number(amt), code
  });
  if(error){ err.textContent = error.message; err.style.display='block'; return; }

  document.getElementById('withdraw-code').textContent = code;
  document.getElementById('withdraw-code-box').classList.remove('hidden');
  document.getElementById('withdraw-confirm-btn').disabled = true;
  addHistoryEvent('➖','Withdrawal requested — code '+code, -Number(amt));
}


/* ---------------- history ---------------- */
async function addHistoryEvent(icon, title, amount){
  if(!currentProfile) return;
  await sb.from('history').insert({ user_id: currentProfile.id, icon, title, amount });
  renderHistory();
}
function fmtDay(ts){
  const d = new Date(ts);
  const days = Math.floor((Date.now()-ts)/86400000);
  if(days<=0) return 'Today';
  if(days===1) return 'Yesterday';
  return d.toLocaleDateString(undefined,{weekday:'long', month:'short', day:'numeric'});
}
function fmtTime(ts){
  return new Date(ts).toLocaleTimeString(undefined,{hour:'2-digit', minute:'2-digit'});
}
async function renderHistory(){
  if(!currentProfile) return;
  const cutoff = new Date(Date.now() - 5*86400000).toISOString();
  const { data: recent, error } = await sb.from('history')
    .select('*').eq('user_id', currentProfile.id)
    .gte('created_at', cutoff).order('created_at', {ascending:false});

  const wrap = document.getElementById('history-list');
  wrap.innerHTML = '';
  if(error){ wrap.innerHTML = '<div class="card">Could not load history.</div>'; return; }
  if(!recent || recent.length===0){
    wrap.innerHTML = '<div class="card empty-state"><div class="emoji">🕐</div><div class="msg">No activity in the last 5 days yet — go play a game!</div></div>';
    return;
  }
  let lastLabel = null;
  recent.forEach(e=>{
    const ts = new Date(e.created_at).getTime();
    const label = fmtDay(ts);
    if(label !== lastLabel){
      const lab = document.createElement('div');
      lab.className='history-day-label';
      lab.textContent = label;
      wrap.appendChild(lab);
      lastLabel = label;
    }
    const row = document.createElement('div');
    row.className='history-item';
    let amountHtml = '';
    if(e.amount !== null && e.amount !== undefined){
      const cls = e.amount>=0 ? 'amt-pos':'amt-neg';
      amountHtml = `<div class="hi-amount ${cls}">${e.amount>=0?'+':''}${e.amount}</div>`;
    }
    row.innerHTML = `<div class="hi-icon" style="background:var(--panel-2)">${e.icon||'•'}</div>
      <div class="hi-body"><div class="hi-title">${e.title}</div><div class="hi-time">${fmtTime(ts)}</div></div>
      ${amountHtml}`;
    wrap.appendChild(row);
  });
}

/* ---------------- ludo — real, cross-device rooms ---------------- */
const seatMeta = [
  {label:'You',           color:'#ff5d73'},
  {label:'Green player',  color:'#2ee6c5'},
  {label:'Yellow player', color:'#f2b134'},
  {label:'Blue player',   color:'#7c9cff'}
];

async function openLudo(){
  const code = 'TT-' + Math.floor(1000+Math.random()*9000);
  const seats = [ { uid: currentProfile.id, name: currentProfile.name }, null, null, null ];
  const { data, error } = await sb.from('ludo_rooms').insert({ code, seats }).select().single();
  if(error){ alert('Could not create room: '+error.message); return; }
  currentRoom = data;
  subscribeToRoom(data.id);
  document.getElementById('room-code').textContent = data.code;
  renderSeats();
  goto('page-ludo');
}

async function joinRoomByCode(){
  const codeInput = document.getElementById('join-code-input');
  const code = codeInput.value.trim().toUpperCase();
  if(!code) return;
  const { data: room, error } = await sb.from('ludo_rooms').select('*').eq('code', code).single();
  if(error || !room){ alert('No room found with that code.'); return; }

  const seats = room.seats.slice();
  const already = seats.findIndex(s => s && s.uid === currentProfile.id);
  if(already === -1){
    const openSeat = seats.findIndex(s => s === null);
    if(openSeat === -1){ alert('That room is full.'); return; }
    seats[openSeat] = { uid: currentProfile.id, name: currentProfile.name };
    const { data: updated, error: upErr } = await sb.from('ludo_rooms')
      .update({ seats, updated_at: new Date().toISOString() }).eq('id', room.id).select().single();
    if(upErr){ alert('Could not join: '+upErr.message); return; }
    currentRoom = updated;
  } else {
    currentRoom = room;
  }
  subscribeToRoom(currentRoom.id);
  document.getElementById('room-code').textContent = currentRoom.code;
  renderSeats();
  goto('page-ludo');
}

function subscribeToRoom(roomId){
  if(roomChannel){ sb.removeChannel(roomChannel); roomChannel = null; }
  roomChannel = sb.channel('room-'+roomId)
    .on('postgres_changes', { event:'UPDATE', schema:'public', table:'ludo_rooms', filter:`id=eq.${roomId}` },
      (payload) => { currentRoom = payload.new; renderSeats(); })
    .subscribe();
}

function renderSeats(){
  if(!currentRoom) return;
  const seatEls = document.querySelectorAll('#page-ludo .seat');
  currentRoom.seats.forEach((s, i) => {
    const el = seatEls[i];
    el.classList.remove('empty','you');
    if(!s){
      el.classList.add('empty');
      el.innerHTML = `<div class="dot" style="background:${seatMeta[i].color};"></div>Empty`;
    } else {
      const isYou = s.uid === currentProfile.id;
      if(isYou) el.classList.add('you');
      el.innerHTML = `<div class="dot" style="background:${seatMeta[i].color};"></div>${isYou ? 'You' : (s.name||'Player')}`;
    }
  });

  const mySeat = currentRoom.seats.findIndex(s => s && s.uid === currentProfile.id);
  const isMyTurn = mySeat !== -1 && currentRoom.current_turn === mySeat;
  const status = document.getElementById('turn-status');
  const diceBtn = document.getElementById('dice-btn');
  if(currentRoom.last_roll){
    document.getElementById('dice-result').textContent = ['⚀','⚁','⚂','⚃','⚄','⚅'][currentRoom.last_roll-1];
  }
  if(mySeat === -1){
    status.textContent = 'Spectating this room.';
    diceBtn.disabled = true;
  } else if(isMyTurn){
    status.textContent = 'Your turn — roll the dice';
    diceBtn.disabled = false;
  } else {
    const turnName = (currentRoom.seats[currentRoom.current_turn]||{}).name || seatMeta[currentRoom.current_turn].label;
    status.textContent = `Waiting for ${turnName} to roll…`;
    diceBtn.disabled = true;
  }
}

async function rollDice(){
  if(!currentRoom) return;
  const val = 1 + Math.floor(Math.random()*6);
  const nextTurn = (currentRoom.current_turn + 1) % 4;
  const { data, error } = await sb.from('ludo_rooms')
    .update({ last_roll: val, current_turn: nextTurn, updated_at: new Date().toISOString() })
    .eq('id', currentRoom.id).select().single();
  if(error) return;
  currentRoom = data;
  renderSeats();
  addHistoryEvent('🎲', 'Rolled a '+val+' in Ludo (room '+currentRoom.code+')', null);
}


/* ---------------- snake & ladder — real, cross-device rooms ---------------- */
const SL_LADDERS = {2:38, 7:14, 8:31, 15:26, 21:42, 28:84, 36:44, 51:67, 71:91, 78:98};
const SL_SNAKES  = {16:6, 46:25, 49:11, 62:19, 64:60, 74:53, 89:68, 92:88, 95:75, 99:58};
const slSeatColors = ['#ff5d73','#2ee6c5','#f2b134','#7c9cff'];
let currentSlRoom = null;
let slRoomChannel = null;
let slBoardBuilt = false;

function buildSlBoard(){
  const board = document.getElementById('sl-board');
  board.innerHTML = '';
  // classic boustrophedon numbering: bottom row is 1-10 left-to-right, next row right-to-left, etc.
  for(let row=9; row>=0; row--){
    const leftToRight = (9-row) % 2 === 0;
    for(let col=0; col<10; col++){
      const c = leftToRight ? col : 9-col;
      const num = row*10 + c + 1;
      const cell = document.createElement('div');
      cell.className = 'sl-cell' + ((row+col)%2===1 ? ' alt' : '');
      cell.dataset.num = num;
      cell.innerHTML = `<span>${num}</span>`;
      if(SL_LADDERS[num]){ cell.classList.add('ladder'); cell.innerHTML += `<span class="icon">🪜</span>`; }
      if(SL_SNAKES[num]){ cell.classList.add('snake'); cell.innerHTML += `<span class="icon">🐍</span>`; }
      board.appendChild(cell);
    }
  }
  slBoardBuilt = true;
}

function slCellCenter(num){
  if(num<=0) return {left:'-14%', top:'92%'}; // off-board start
  const idx = num-1;
  const row = Math.floor(idx/10);
  const leftToRight = row % 2 === 0;
  let col = idx % 10;
  if(!leftToRight) col = 9-col;
  const left = (col + 0.5) * 10;
  const top = (9-row + 0.5) * 10;
  return { left: left+'%', top: top+'%' };
}

async function openSnake(){
  if(!slBoardBuilt) buildSlBoard();
  const code = 'TT-' + Math.floor(1000+Math.random()*9000);
  const seats = [ { uid: currentProfile.id, name: currentProfile.name }, null, null, null ];
  const { data, error } = await sb.from('snake_rooms').insert({ code, seats }).select().single();
  if(error){ alert('Could not create room: '+error.message); return; }
  currentSlRoom = data;
  subscribeToSlRoom(data.id);
  document.getElementById('sl-room-code').textContent = data.code;
  renderSlRoom();
  goto('page-snake');
}
async function joinSlRoomByCode(){
  if(!slBoardBuilt) buildSlBoard();
  const codeInput = document.getElementById('sl-join-code-input');
  const code = codeInput.value.trim().toUpperCase();
  if(!code) return;
  const { data: room, error } = await sb.from('snake_rooms').select('*').eq('code', code).single();
  if(error || !room){ alert('No room found with that code.'); return; }
  const seats = room.seats.slice();
  const already = seats.findIndex(s => s && s.uid === currentProfile.id);
  if(already === -1){
    const openSeat = seats.findIndex(s => s === null);
    if(openSeat === -1){ alert('That room is full.'); return; }
    seats[openSeat] = { uid: currentProfile.id, name: currentProfile.name };
    const { data: updated, error: upErr } = await sb.from('snake_rooms')
      .update({ seats, updated_at: new Date().toISOString() }).eq('id', room.id).select().single();
    if(upErr){ alert('Could not join: '+upErr.message); return; }
    currentSlRoom = updated;
  } else {
    currentSlRoom = room;
  }
  subscribeToSlRoom(currentSlRoom.id);
  document.getElementById('sl-room-code').textContent = currentSlRoom.code;
  renderSlRoom();
  goto('page-snake');
}
function subscribeToSlRoom(roomId){
  if(slRoomChannel){ sb.removeChannel(slRoomChannel); slRoomChannel = null; }
  slRoomChannel = sb.channel('sl-room-'+roomId)
    .on('postgres_changes', { event:'UPDATE', schema:'public', table:'snake_rooms', filter:`id=eq.${roomId}` },
      (payload) => { currentSlRoom = payload.new; renderSlRoom(); })
    .subscribe();
}
function copySlRoom(){
  const code = document.getElementById('sl-room-code').textContent;
  navigator.clipboard?.writeText(code);
  const btn = event.target; const old = btn.textContent;
  btn.textContent = 'Copied!'; setTimeout(()=>btn.textContent=old, 1200);
}

function renderSlRoom(){
  if(!currentSlRoom) return;
  const seatEls = document.querySelectorAll('#sl-seats .seat');
  currentSlRoom.seats.forEach((s,i)=>{
    const el = seatEls[i];
    el.classList.remove('empty','you');
    if(!s){ el.classList.add('empty'); el.innerHTML = `<div class="dot" style="background:${slSeatColors[i]};"></div>Empty`; }
    else{
      const isYou = s.uid === currentProfile.id;
      if(isYou) el.classList.add('you');
      el.innerHTML = `<div class="dot" style="background:${slSeatColors[i]};"></div>${isYou?'You':(s.name||'Player')}`;
    }
  });

  // tokens
  document.querySelectorAll('.sl-token').forEach(t=>t.remove());
  const board = document.getElementById('sl-board');
  currentSlRoom.positions.forEach((pos,i)=>{
    if(!currentSlRoom.seats[i]) return;
    const { left, top } = slCellCenter(pos);
    const tok = document.createElement('div');
    tok.className = 'sl-token';
    tok.style.background = slSeatColors[i];
    tok.style.left = `calc(${left} - 4.5%)`;
    tok.style.top = `calc(${top} - 4.5%)`;
    tok.style.marginLeft = (i%2===0? '-4px':'4px');
    tok.style.marginTop = (i<2? '-4px':'4px');
    board.appendChild(tok);
  });

  const mySeat = currentSlRoom.seats.findIndex(s=>s && s.uid===currentProfile.id);
  const isMyTurn = mySeat !== -1 && currentSlRoom.current_turn === mySeat;
  const status = document.getElementById('sl-turn-status');
  const btn = document.getElementById('sl-dice-btn');
  if(currentSlRoom.last_roll){
    document.getElementById('sl-dice-result').textContent = ['⚀','⚁','⚂','⚃','⚄','⚅'][currentSlRoom.last_roll-1];
  }
  if(currentSlRoom.winner_seat !== null && currentSlRoom.winner_seat !== undefined){
    const w = currentSlRoom.seats[currentSlRoom.winner_seat];
    status.textContent = (w && w.uid===currentProfile.id) ? '🏆 You reached square 100 — you win!' : `🏆 ${w?w.name:'A player'} reached square 100 and won.`;
    btn.disabled = true;
  } else if(mySeat === -1){
    status.textContent = 'Spectating this room.'; btn.disabled = true;
  } else if(isMyTurn){
    status.textContent = 'Your turn — roll the dice'; btn.disabled = false;
  } else {
    const name = (currentSlRoom.seats[currentSlRoom.current_turn]||{}).name || 'the next player';
    status.textContent = `Waiting for ${name} to roll…`; btn.disabled = true;
  }
}

async function rollSlDice(){
  if(!currentSlRoom) return;
  const mySeat = currentSlRoom.seats.findIndex(s=>s && s.uid===currentProfile.id);
  if(mySeat !== currentSlRoom.current_turn) return;

  const val = 1 + Math.floor(Math.random()*6);
  const positions = currentSlRoom.positions.slice();
  let newPos = positions[mySeat] + val;
  if(newPos > 100) newPos = positions[mySeat]; // must roll exact — stay put on overshoot
  else if(SL_LADDERS[newPos]) newPos = SL_LADDERS[newPos];
  else if(SL_SNAKES[newPos]) newPos = SL_SNAKES[newPos];
  positions[mySeat] = newPos;

  let nextTurn = currentSlRoom.current_turn;
  const seatCount = currentSlRoom.seats.length;
  do { nextTurn = (nextTurn+1) % seatCount; } while(!currentSlRoom.seats[nextTurn] && nextTurn !== currentSlRoom.current_turn);

  const winner = newPos === 100 ? mySeat : (currentSlRoom.winner_seat ?? null);

  const { data, error } = await sb.from('snake_rooms').update({
    positions, last_roll: val, current_turn: nextTurn, winner_seat: winner, updated_at: new Date().toISOString()
  }).eq('id', currentSlRoom.id).select().single();
  if(error) return;
  currentSlRoom = data;
  renderSlRoom();
  addHistoryEvent('🐍', 'Rolled a '+val+' in Snake & Ladder (room '+currentSlRoom.code+')', null);
  if(winner===mySeat) addHistoryEvent('🏆', 'Won a Snake & Ladder match', null);
}

/* ---------------- tournaments ---------------- */
async function checkTournamentBadge(){
  const { data } = await sb.from('tournaments').select('id').eq('status','registration_open');
  document.getElementById('tournament-badge').classList.toggle('hidden', !(data && data.length));
}

async function renderTournaments(){
  const wrap = document.getElementById('tournaments-wrap');
  const { data: tournaments } = await sb.from('tournaments').select('*')
    .in('status', ['upcoming','registration_open','ongoing','completed']).order('created_at',{ascending:false});
  if(!tournaments || tournaments.length===0){
    wrap.innerHTML = '<div class="card empty-state"><div class="emoji">🏆</div><div class="msg">No tournaments right now — check back soon.</div></div>';
    return;
  }
  const { data: myRegs } = await sb.from('tournament_registrations').select('*').eq('user_id', currentProfile.id);
  const regMap = {}; (myRegs||[]).forEach(r => regMap[r.tournament_id] = r);

  const cards = await Promise.all(tournaments.map(async t => {
    const reg = regMap[t.id];
    let matchHtml = '';
    if(reg && reg.status==='confirmed'){
      const { data: matches } = await sb.from('tournament_matches').select('*').eq('tournament_id', t.id)
        .or(`p1_id.eq.${currentProfile.id},p2_id.eq.${currentProfile.id},p3_id.eq.${currentProfile.id},p4_id.eq.${currentProfile.id}`);
      if(matches && matches.length){
        const m = matches[0];
        const myColor = m.p1_id===currentProfile.id?m.p1_color : m.p2_id===currentProfile.id?m.p2_color : m.p3_id===currentProfile.id?m.p3_color : m.p4_color;
        matchHtml = `<div class="note-box" style="margin-top:10px;">🎮 You're placed in Round ${m.round}, Match ${m.match_number} — your colour: <b>${myColor}</b>. ${m.status==='completed' ? (m.winner_id===currentProfile.id ? '🏆 You won this match!' : 'Match complete.') : 'Await your match time.'}</div>`;
      }
    }
    let statusPill = '';
    let actionHtml = '';
    if(!reg){
      statusPill = `<span class="tag">${t.status==='registration_open'?'Registration open':t.status.replace('_',' ')}</span>`;
      actionHtml = t.status==='registration_open'
        ? `<button class="play-btn primary" onclick="registerForTournament('${t.id}')">Register — free entry</button>`
        : `<button class="play-btn" disabled>Not open yet</button>`;
    } else if(reg.status==='pending'){
      statusPill = `<span class="tag live">Registered — awaiting confirmation</span>`;
    } else if(reg.status==='confirmed'){
      statusPill = `<span class="tag live">Confirmed ✓</span>`;
    } else {
      statusPill = `<span class="tag" style="color:var(--red);">Registration not accepted</span>`;
    }
    return `
      <div class="card">
        ${t.banner_url ? `<div class="tournament-banner-wrap"><img src="${t.banner_url}"></div>` : ''}
        <h3 style="margin:0 0 4px;">${t.title}</h3>
        <p style="color:var(--text-dim); font-size:13px; margin:0 0 8px;">${t.description||''}</p>
        <div class="tag-row" style="margin-bottom:10px;">
          ${statusPill}
          <span class="tag">Prize: Rs ${Number(t.prize_amount).toLocaleString()}</span>
          ${t.start_time ? `<span class="tag">Starts ${new Date(t.start_time).toLocaleString()}</span>` : ''}
        </div>
        ${actionHtml}
        ${matchHtml}
      </div>`;
  }));
  wrap.innerHTML = cards.join('');
  checkTournamentBadge();
}

async function registerForTournament(tid){
  const { error } = await sb.from('tournament_registrations').insert({ tournament_id: tid, user_id: currentProfile.id });
  if(error){ alert(error.message.includes('duplicate') ? 'You already registered for this tournament.' : error.message); return; }
  addHistoryEvent('🏆','Registered for a tournament', null);
  renderTournaments();
}

/* ---------------- support chat ---------------- */
let mySupportChatId = null;
let supportChannel = null;

async function renderSupport(){
  if(!currentProfile) return;
  const { data, error } = await sb.from('support_chats').select('*')
    .eq('user_id', currentProfile.id).eq('status','open')
    .order('created_at',{ascending:false}).limit(1).maybeSingle();

  if(error) console.warn('support load:', error.message);
  mySupportChatId = data ? data.id : null;
  document.getElementById('support-empty').classList.toggle('hidden', !!mySupportChatId);

  if(mySupportChatId){
    await renderSupportMessages();
    subscribeSupport();
  } else {
    document.getElementById('support-messages').innerHTML = '';
  }
}

function subscribeSupport(){
  if(!mySupportChatId) return;
  if(supportChannel) sb.removeChannel(supportChannel);
  supportChannel = sb.channel('support-'+mySupportChatId)
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'support_messages', filter:`chat_id=eq.${mySupportChatId}` }, renderSupportMessages)
    .subscribe();
}

async function renderSupportMessages(){
  if(!mySupportChatId) return;
  const { data, error } = await sb.from('support_messages').select('*')
    .eq('chat_id', mySupportChatId).order('created_at',{ascending:true});
  const wrap = document.getElementById('support-messages');
  if(error){ wrap.innerHTML = `<div class="support-msg admin">Couldn't load messages: ${error.message}</div>`; return; }
  wrap.innerHTML = (data||[]).map(m => `
    <div class="support-msg ${m.sender === 'admin' ? 'admin' : 'player'}">
      <div class="who">${m.sender === 'admin' ? 'Support' : 'You'}</div>
      <div>${escapeHtml(m.body)}</div>
    </div>`).join('');
  wrap.scrollTop = wrap.scrollHeight;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function sendSupportMessage(){
  const input = document.getElementById('support-input');
  const btn = document.getElementById('support-send-btn');
  const body = input.value.trim();
  if(!body) { input.focus(); return; }
  if(!currentProfile){ alert('Please log in again.'); return; }

  btn.disabled = true; btn.textContent = 'Sending…';
  try{
    if(!mySupportChatId){
      const { data, error } = await sb.from('support_chats')
        .insert({ user_id: currentProfile.id, subject: body.slice(0,60) })
        .select().single();
      if(error) throw error;
      mySupportChatId = data.id;
      document.getElementById('support-empty').classList.add('hidden');
      subscribeSupport();
    }
    const { error: msgErr } = await sb.from('support_messages')
      .insert({ chat_id: mySupportChatId, sender:'player', body });
    if(msgErr) throw msgErr;

    input.value = '';
    await renderSupportMessages();
  } catch(e){
    alert('Could not send: ' + (e.message || e));
  } finally {
    btn.disabled = false; btn.textContent = 'Send';
    input.focus();
  }
}

/* press Enter to send */
document.addEventListener('DOMContentLoaded', ()=>{
  const input = document.getElementById('support-input');
  if(input) input.addEventListener('keydown', e => {
    if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); sendSupportMessage(); }
  });
});

/* ---------------- notifications ---------------- */
async function checkNotifDot(){
  if(!currentProfile) return;
  const [{data:anns},{data:reads}] = await Promise.all([
    sb.from('announcements').select('id'),
    sb.from('announcement_reads').select('announcement_id').eq('user_id', currentProfile.id)
  ]);
  const readIds = new Set((reads||[]).map(r=>r.announcement_id));
  const unread = (anns||[]).filter(a=>!readIds.has(a.id)).length;
  document.getElementById('notif-dot').classList.toggle('hidden', unread===0);
}

async function renderNotifications(){
  const wrap = document.getElementById('notifications-wrap');
  const { data: anns } = await sb.from('announcements').select('*').order('created_at',{ascending:false});
  if(!anns || anns.length===0){
    wrap.innerHTML = '<div class="card empty-state"><div class="emoji">🔔</div><div class="msg">No announcements yet.</div></div>';
    return;
  }
  const kindIcon = { info:'ℹ️', tournament:'🏆', payout:'💰', warning:'⚠️' };
  wrap.innerHTML = anns.map(a=>`
    <div class="history-item">
      <div class="hi-icon" style="background:var(--panel-2)">${kindIcon[a.kind]||'ℹ️'}</div>
      <div class="hi-body">
        <div class="hi-title">${a.title}</div>
        <div class="hi-time">${a.body||''}</div>
        <div class="hi-time" style="opacity:.7; margin-top:2px;">${new Date(a.created_at).toLocaleString()}</div>
      </div>
    </div>`).join('');

  // mark everything read
  const { data: reads } = await sb.from('announcement_reads').select('announcement_id').eq('user_id', currentProfile.id);
  const readIds = new Set((reads||[]).map(r=>r.announcement_id));
  const toMark = anns.filter(a=>!readIds.has(a.id)).map(a=>({ user_id: currentProfile.id, announcement_id: a.id }));
  if(toMark.length) await sb.from('announcement_reads').insert(toMark);
  document.getElementById('notif-dot').classList.add('hidden');
}


/* ---------------- leaderboard ---------------- */
async function renderLeaderboard(){
  const wrap = document.getElementById('leaderboard-wrap');
  const { data, error } = await sb.from('leaderboard').select('*').order('wins',{ascending:false}).limit(50);
  if(error || !data || data.length===0){
    wrap.innerHTML = '<div class="card empty-state"><div class="emoji">🏅</div><div class="msg">No ranked players yet — win a tournament to appear here.</div></div>';
    return;
  }
  const medal = i => i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`;
  wrap.innerHTML = data.map((p,i)=>`
    <div class="history-item" ${p.id===currentProfile.id?'style="border-color:var(--gold);"':''}>
      <div class="hi-icon" style="background:var(--panel-2); font-size:15px;">${medal(i)}</div>
      <div class="hi-body">
        <div class="hi-title">${p.name||'Player'} ${p.id===currentProfile.id?'<span style="color:var(--gold-2); font-size:11px;">(you)</span>':''}</div>
        <div class="hi-time">ID ${p.player_id} · ${p.tournaments_played} tournament${p.tournaments_played===1?'':'s'}</div>
      </div>
      <div class="hi-amount amt-pos">${p.wins} win${p.wins===1?'':'s'}</div>
    </div>`).join('');
}

/* ---------------- boot ----------------
   Runs last, after every other script has defined its functions.
---------------------------------------------------------------- */
(async function boot(){
  const { data:{ session } } = await sb.auth.getSession();
  if(session){
    await loginFlow();
  }
})();
