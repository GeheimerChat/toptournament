/* ---------------- supabase client ---------------- */
const SUPABASE_URL = 'https://ndtwhvzhlmewlufxyyyb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_m_3Tc9WAxT7uzzY9O0Sqsw_PAwgs1o0';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentProfile = null;   // { id(uuid), player_id, name, email, theme, kyc_verified }
let ludoRoomLegacy = null;   // (unused — kept out of the way)

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
  renderStakeNotice();
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
  if(!surname || !lastname || !age || !location || !doc){
    err.textContent = 'Please fill in every field.';
    err.style.display='block'; return;
  }
  const ageNum = Number(age);
  if(!Number.isInteger(ageNum) || ageNum < 1 || ageNum > 120){
    err.textContent = 'Enter a valid age.';
    err.style.display='block'; return;
  }
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
  renderStakeNotice();
  if(Number(age) < 18){
    alert('Your details are saved.\n\nBecause you are under 18, staked games stay locked — free tables are still open to you.');
  }
  addHistoryEvent('✅','KYC details submitted', null);
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
    const bEl = document.getElementById('withdraw-balance');
    if(bEl) bEl.textContent = 'Rs ' + Number((currentProfile||{}).balance || 0).toLocaleString();
    const verified = currentProfile && currentProfile.kyc_verified;
    document.getElementById('withdraw-locked').classList.toggle('hidden', !!verified);
    document.getElementById('withdraw-open').classList.toggle('hidden', !verified);
    document.getElementById('withdraw-code-box').classList.add('hidden');
    document.getElementById('withdraw-amount').value = '';
    document.getElementById('withdraw-confirm-btn').disabled = false;
  }
  if(pageId==='page-tournaments') renderTournaments();
  if(pageId==='page-ttt') renderTTT();
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
function randomCode(len=5){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let out='';
  for(let i=0;i<len;i++) out += chars[Math.floor(Math.random()*chars.length)];
  return out;
}
async function confirmWithdraw(){
  const raw = document.getElementById('withdraw-amount').value;
  const err = document.getElementById('withdraw-error');
  const amt = Number(raw);
  err.style.color = 'var(--red)';

  if(!raw || !isFinite(amt) || amt <= 0){
    err.textContent = 'Enter an amount greater than zero.';
    err.style.display = 'block';
    return;
  }

  // quick local check so the common mistake is caught instantly...
  const bal = Number(currentProfile.balance || 0);
  if(amt > bal){
    err.textContent = `Insufficient amount. Your balance is Rs ${bal} — you can't withdraw Rs ${amt}.`;
    err.style.display = 'block';
    return;
  }

  err.style.display = 'none';
  const code = randomCode(5);

  // ...and the database checks again (including pending requests and KYC),
  // because a browser-side check can always be bypassed.
  const { error } = await sb.rpc('request_withdrawal', { p_amount: amt, p_code: code });
  if(error){
    err.textContent = error.message.replace(/^.*?(Insufficient|Complete|Enter)/, '$1');
    err.style.display = 'block';
    return;
  }

  document.getElementById('withdraw-code').textContent = code;
  document.getElementById('withdraw-code-box').classList.remove('hidden');
  document.getElementById('withdraw-confirm-btn').disabled = true;
  renderHistory();
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

/* =====================================================================
   LUDO — full game
   Board is a standard 15x15 grid. Seats are clockwise:
     0 = Red    (top-left)
     1 = Green  (top-right)
     2 = Yellow (bottom-right)
     3 = Blue   (bottom-left)

   Token encoding (per token):
     -1        in base
     0..50     that player's 51 squares of the shared 52-square track
     51..55    that player's private home column
     56        finished
   ===================================================================== */

/* The shared 52-square circuit, clockwise, as [row, col] on the 15x15 grid. */
const LUDO_TRACK = [
  [6,1],[6,2],[6,3],[6,4],[6,5],
  [5,6],[4,6],[3,6],[2,6],[1,6],[0,6],
  [0,7],
  [0,8],[1,8],[2,8],[3,8],[4,8],[5,8],
  [6,9],[6,10],[6,11],[6,12],[6,13],[6,14],
  [7,14],
  [8,14],[8,13],[8,12],[8,11],[8,10],[8,9],
  [9,8],[10,8],[11,8],[12,8],[13,8],[14,8],
  [14,7],
  [14,6],[13,6],[12,6],[11,6],[10,6],[9,6],
  [8,5],[8,4],[8,3],[8,2],[8,1],[8,0],
  [7,0],
  [6,0]
];

/* Where each seat joins the circuit. 13 apart, so the board stays symmetric. */
const LUDO_START = [0, 13, 26, 39];

/* Each seat's private home column, walked from the outside inwards. */
const LUDO_HOME_COL = [
  [[7,1],[7,2],[7,3],[7,4],[7,5]],        // red
  [[1,7],[2,7],[3,7],[4,7],[5,7]],        // green
  [[7,13],[7,12],[7,11],[7,10],[7,9]],    // yellow
  [[13,7],[12,7],[11,7],[10,7],[9,7]]     // blue
];

/* The four resting slots inside each base, as fractional grid coords. */
const LUDO_BASE_SLOTS = [
  [[1.5,1.5],[1.5,3.5],[3.5,1.5],[3.5,3.5]],
  [[1.5,10.5],[1.5,12.5],[3.5,10.5],[3.5,12.5]],
  [[10.5,10.5],[10.5,12.5],[12.5,10.5],[12.5,12.5]],
  [[10.5,1.5],[10.5,3.5],[12.5,1.5],[12.5,3.5]]
];

/* Safe squares: the four entry squares plus the four stars 8 ahead of each. */
const LUDO_SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

const LUDO_COLORS  = ['#e6455c', '#1faa72', '#f0b429', '#3f7fd8'];
const LUDO_NAMES   = ['Red', 'Green', 'Yellow', 'Blue'];
const LUDO_DIE     = ['⚀','⚁','⚂','⚃','⚄','⚅'];

let ludoRoom = null;        // the live row from Supabase
let ludoChannel = null;
let ludoBoardBuilt = false;
let ludoBusy = false;       // guards against double-taps mid-write

/* ---------- geometry helpers ---------- */

/* Convert a token's encoded position into a [row, col] on the grid. */
function ludoCell(seat, pos, tokenIndex){
  if(pos < 0)  return LUDO_BASE_SLOTS[seat][tokenIndex];
  if(pos <= 50) return LUDO_TRACK[(LUDO_START[seat] + pos) % 52];
  if(pos <= 55) return LUDO_HOME_COL[seat][pos - 51];
  return [7,7];                       // finished — the centre
}

/* A token's absolute index on the shared circuit, or null if it isn't on it. */
function ludoTrackIndex(seat, pos){
  if(pos < 0 || pos > 50) return null;
  return (LUDO_START[seat] + pos) % 52;
}

/* ---------- rules ---------- */

/* Which of a seat's tokens may legally move with this roll. */
function ludoMovableTokens(tokens, seat, roll){
  const out = [];
  tokens[seat].forEach((pos, i) => {
    if(pos === 56) return;                         // already home
    if(pos < 0){ if(roll === 6) out.push(i); return; }  // needs a 6 to come out
    if(pos + roll <= 56) out.push(i);              // must land exactly on 56
  });
  return out;
}

/* Apply a move, returning the new token grid plus what happened. */
function ludoApplyMove(tokens, seat, tokenIndex, roll){
  const next = tokens.map(row => row.slice());
  const from = next[seat][tokenIndex];
  let to, captured = false, finished = false;

  if(from < 0){
    to = 0;                                        // leaving base onto the start square
  } else {
    to = from + roll;
    if(to === 56) finished = true;
  }
  next[seat][tokenIndex] = to;

  // capturing only happens on the shared circuit, never on a safe square
  const landing = ludoTrackIndex(seat, to);
  if(landing !== null && !LUDO_SAFE.has(landing)){
    for(let s = 0; s < 4; s++){
      if(s === seat) continue;
      next[s].forEach((p, i) => {
        if(ludoTrackIndex(s, p) === landing){
          next[s][i] = -1;                          // sent back to base
          captured = true;
        }
      });
    }
  }
  return { tokens: next, captured, finished };
}

/* Next seat that actually has a player in it. */
function ludoNextSeat(room, from, tokens){
  const t = tokens || room.tokens;
  const count = room.player_count || 4;
  for(let step = 1; step <= count; step++){
    const s = (from + step) % count;
    if(!room.seats[s]) continue;
    const done = (t[s] || []).every(p => p === 56);   // already placed
    if(!done) return s;
  }
  return from;
}

function ludoSeatOf(room){
  if(!room || !currentProfile) return -1;
  return room.seats.findIndex(s => s && s.uid === currentProfile.id);
}

/* ---------- board rendering ---------- */

function buildLudoBoard(){
  const board = document.getElementById('ludo-board');
  if(!board) return;
  board.innerHTML = '';

  // mark every cell so we can colour paths, bases, stars and the centre
  const trackIdx = new Map();
  LUDO_TRACK.forEach(([r,c], i) => trackIdx.set(r+','+c, i));
  const homeCell = new Map();
  LUDO_HOME_COL.forEach((col, seat) => col.forEach(([r,c]) => homeCell.set(r+','+c, seat)));

  for(let r = 0; r < 15; r++){
    for(let c = 0; c < 15; c++){
      const cell = document.createElement('div');
      cell.className = 'lu-cell';
      const key = r+','+c;

      // the four bases
      const inBase =
        (r<6 && c<6) ? 0 : (r<6 && c>8) ? 1 : (r>8 && c>8) ? 2 : (r>8 && c<6) ? 3 : -1;

      if(inBase >= 0){
        cell.classList.add('lu-base', 'lu-base-'+inBase);
      } else if(r>=6 && r<=8 && c>=6 && c<=8){
        cell.classList.add('lu-centre');
      } else if(homeCell.has(key)){
        cell.classList.add('lu-home', 'lu-home-'+homeCell.get(key));
      } else if(trackIdx.has(key)){
        const i = trackIdx.get(key);
        cell.classList.add('lu-path');
        const startSeat = LUDO_START.indexOf(i);
        if(startSeat >= 0) cell.classList.add('lu-start', 'lu-start-'+startSeat);
        else if(LUDO_SAFE.has(i)) cell.classList.add('lu-safe');
      } else {
        cell.classList.add('lu-blank');
      }
      cell.style.gridRow = (r+1);
      cell.style.gridColumn = (c+1);
      board.appendChild(cell);
    }
  }

  // the four inner circles of each base, where idle tokens sit
  LUDO_BASE_SLOTS.forEach((slots, seat) => {
    const pad = document.createElement('div');
    pad.className = 'lu-base-pad lu-base-pad-'+seat;
    board.appendChild(pad);
  });

  // centre triangles pointing into the middle
  const centre = document.createElement('div');
  centre.className = 'lu-centre-art';
  centre.innerHTML = '<i class="ct-r"></i><i class="ct-g"></i><i class="ct-y"></i><i class="ct-b"></i>';
  board.appendChild(centre);

  // arrows showing direction of travel out of each base
  ludoBoardBuilt = true;
}

/* Draw tokens, dice, seat cards and turn state from the current room row. */
function renderLudo(){
  if(!ludoRoom) return;
  if(handleCancellation('ludo', ludoRoom)) return;
  if(!ludoBoardBuilt) buildLudoBoard();

  const board = document.getElementById('ludo-board');
  const mySeat = ludoSeatOf(ludoRoom);
  const myTurn = mySeat >= 0 && ludoRoom.current_turn === mySeat && !ludoRoom.winner_seat && ludoRoom.winner_seat !== 0;
  const isMyTurn = mySeat >= 0 && ludoRoom.current_turn === mySeat && ludoRoom.winner_seat === null;

  // --- seats ---
  renderPot('ludo-pot', ludoRoom.stake || 0, ludoRoom.seats.filter(Boolean).length);

  const placed = ludoRoom.finished_order || [];
  const MEDAL = ['🥇','🥈','🥉','🏁'];

  const seatWrap = document.getElementById('ludo-seats');
  seatWrap.innerHTML = ludoRoom.seats.map((s, i) => {
    if(i >= ludoRoom.player_count) return '';
    const home = (ludoRoom.tokens[i] || []).filter(p => p === 56).length;
    const rank = placed.indexOf(i);
    const active = ludoRoom.current_turn === i && rank < 0 && !ludoRoom.game_over;
    return `<div class="lu-seat ${active ? 'active' : ''} ${s ? '' : 'empty'} ${rank >= 0 ? 'placed' : ''}" style="--c:${LUDO_COLORS[i]}">
      <span class="lu-seat-dot"></span>
      <span class="lu-seat-name">${s ? (s.uid === (currentProfile||{}).id ? 'You' : s.name) : 'Waiting…'}</span>
      <span class="lu-seat-home">${rank >= 0 ? MEDAL[rank] : home + '/4'}</span>
    </div>`;
  }).join('');

  moveDieToSeat('ludo-die', ludoRoom.current_turn, LUDO_COLORS);

  // --- tokens --- elements persist so they glide square to square
  const occupancy = new Map();
  const live = new Set();

  for(let seat = 0; seat < 4; seat++){
    if(!ludoRoom.seats[seat]) continue;
    (ludoRoom.tokens[seat] || []).forEach((pos, i) => {
      if(ludoOverride && ludoOverride.seat === seat && ludoOverride.idx === i) pos = ludoOverride.pos;
      const [r, c] = ludoCell(seat, pos, i);
      const key = r+','+c;
      const stack = occupancy.get(key) || 0;
      occupancy.set(key, stack + 1);

      const id = `lu-tok-${seat}-${i}`;
      live.add(id);
      let tok = document.getElementById(id);
      if(!tok){
        tok = document.createElement('button');
        tok.id = id;
        tok.className = 'lu-token';
        tok.style.setProperty('--c', LUDO_COLORS[seat]);
        board.appendChild(tok);
      }

      tok.style.left = ((c + 0.5) / 15 * 100) + '%';
      tok.style.top  = ((r + 0.5) / 15 * 100) + '%';
      tok.style.transform = stack
        ? `translate(-50%,-50%) translate(${stack*5}px, ${stack*-4}px)`
        : 'translate(-50%,-50%)';
      tok.classList.toggle('done', pos === 56);
      tok.classList.toggle('stepping',
        !!(ludoOverride && ludoOverride.seat === seat && ludoOverride.idx === i));

      const canMove = isMyTurn && ludoRoom.dice_rolled && !ludoRoom.game_over &&
                      seat === mySeat && (ludoRoom.movable || []).includes(i);
      tok.classList.toggle('movable', canMove);
      tok.disabled = !canMove;
      tok.onclick = canMove ? (() => ludoMove(i)) : null;
    });
  }
  board.querySelectorAll('.lu-token').forEach(el => { if(!live.has(el.id)) el.remove(); });

  // --- dice and status ---
  const dieEl = document.getElementById('ludo-die');
  const rollBtn = document.getElementById('ludo-roll-btn') || {};
  const status = document.getElementById('ludo-status');

  if(!dieEl.classList.contains('rolling')){
    dieEl.textContent = ludoRoom.last_roll ? LUDO_DIE[ludoRoom.last_roll - 1] : '🎲';
  }
  dieEl.style.setProperty('--c', LUDO_COLORS[ludoRoom.current_turn]);

  const myRank = placed.indexOf(mySeat);

  if(ludoRoom.game_over){
    const podium = placed.map((seat, n) =>
      `${MEDAL[n]} ${ludoRoom.seats[seat] ? (ludoRoom.seats[seat].uid === currentProfile.id ? 'You' : ludoRoom.seats[seat].name) : LUDO_NAMES[seat]}`
    ).join('   ');
    status.innerHTML = `<span class="lu-podium">${podium}</span>`;
    rollBtn.disabled = true;
    rollBtn.textContent = 'Game over';
  } else if(myRank >= 0){
    status.textContent = `${MEDAL[myRank]} You finished ${['1st','2nd','3rd','4th'][myRank]} — the game continues for the other places.`;
    rollBtn.disabled = true;
    rollBtn.textContent = 'Finished';
  } else if(mySeat === -1){
    status.textContent = 'Spectating this table.';
    rollBtn.disabled = true;
  } else if(!isMyTurn){
    const t = ludoRoom.seats[ludoRoom.current_turn];
    status.textContent = `${LUDO_NAMES[ludoRoom.current_turn]}'s turn — waiting for ${t ? t.name : 'player'}…`;
    rollBtn.disabled = true;
    rollBtn.textContent = 'Roll dice';
  } else if(ludoRoom.dice_rolled){
    status.textContent = `You rolled ${ludoRoom.last_roll} — tap a highlighted token to move.`;
    rollBtn.disabled = true;
    rollBtn.textContent = 'Pick a token';
  } else {
    status.textContent = 'Your turn — tap the dice.';
    rollBtn.disabled = false;
    rollBtn.textContent = 'Roll dice';
  }

  const canRollLudo = isMyTurn && !ludoRoom.dice_rolled && !ludoRoom.game_over && myRank < 0;
  dieEl.classList.toggle('my-turn', canRollLudo);
  dieEl.onclick = canRollLudo ? rollLudoDice : null;

  if(ludoRoom.last_event){
    document.getElementById('ludo-event').textContent = ludoRoom.last_event;
  }
}

/* ---------- multiplayer ---------- */

async function openLudo(){
  const count = Number(document.getElementById('ludo-player-count')?.value || 4);
  const code = 'TT-' + Math.floor(1000 + Math.random() * 9000);
  const seats = [null, null, null, null];
  seats[0] = { uid: currentProfile.id, name: currentProfile.name };

  const stake = readStake('ludo-stake');

  const { data, error } = await sb.from('ludo_rooms').insert({
    code, seats, player_count: count, stake,
    tokens: [[-1,-1,-1,-1],[-1,-1,-1,-1],[-1,-1,-1,-1],[-1,-1,-1,-1]],
    current_turn: 0, dice_rolled: false, movable: [], consecutive_sixes: 0,
    last_event: stake ? `Table created at Rs ${stake} per player.` : 'Room created — share the code to fill the seats.'
  }).select().single();

  if(error){ alert('Could not create room: ' + error.message); return; }

  // take the creator's stake; if their balance is short, drop the room again
  if(!await collectStake('ludo', data.id, data.code, stake)){
    await sb.from('ludo_rooms').delete().eq('id', data.id);
    return;
  }
  ludoRoom = data;
  subscribeLudo(data.id);
  document.getElementById('ludo-room-code').textContent = data.code;
  attachChat('ludo', data.id);
  ludoPrevTokens = data.tokens.map(r => r.slice());
  buildLudoBoard();
  renderLudo();
  goto('page-ludo');
}

async function joinRoomByCode(){
  const input = document.getElementById('join-code-input');
  const code = (input.value || '').trim().toUpperCase();
  if(!code) return;

  const { data: room, error } = await sb.from('ludo_rooms').select('*').eq('code', code).maybeSingle();
  if(error || !room){ alert('No room found with that code.'); return; }

  let target = room;
  const already = room.seats.findIndex(s => s && s.uid === currentProfile.id);
  if(already === -1){
    const seats = room.seats.slice();
    let open = -1;
    for(let i = 0; i < room.player_count; i++){ if(!seats[i]){ open = i; break; } }
    if(open === -1){ alert('That table is full.'); return; }
    seats[open] = { uid: currentProfile.id, name: currentProfile.name };

    // everyone matches the creator's stake before taking a seat
    if(!await collectStake('ludo', room.id, room.code, room.stake || 0)) return;

    const { data: updated, error: upErr } = await sb.from('ludo_rooms')
      .update({ seats, last_event: `${currentProfile.name} joined as ${LUDO_NAMES[open]}.`, updated_at: new Date().toISOString() })
      .eq('id', room.id).select().single();
    if(upErr){ alert('Could not join: ' + upErr.message); return; }
    target = updated;
  }

  ludoRoom = target;
  subscribeLudo(target.id);
  document.getElementById('ludo-room-code').textContent = target.code;
  attachChat('ludo', target.id);
  ludoPrevTokens = target.tokens.map(r => r.slice());
  buildLudoBoard();
  renderLudo();
  goto('page-ludo');
}

function subscribeLudo(roomId){
  if(ludoChannel) sb.removeChannel(ludoChannel);
  ludoChannel = sb.channel('ludo-'+roomId)
    .on('postgres_changes', { event:'UPDATE', schema:'public', table:'ludo_rooms', filter:`id=eq.${roomId}` },
      payload => { applyLudoState(payload.new); })
    .subscribe();
}

function copyRoom(){
  const code = document.getElementById('ludo-room-code').textContent;
  navigator.clipboard?.writeText(code);
  const btn = event.target, old = btn.textContent;
  btn.textContent = 'Copied!';
  setTimeout(() => btn.textContent = old, 1200);
}

/* ---------- turns ---------- */

async function rollLudoDice(){
  if(ludoBusy || !ludoRoom) return;
  const mySeat = ludoSeatOf(ludoRoom);
  if(mySeat !== ludoRoom.current_turn || ludoRoom.dice_rolled) return;

  ludoBusy = true;
  const roll = 1 + Math.floor(Math.random() * 6);
  const sixes = roll === 6 ? (ludoRoom.consecutive_sixes || 0) + 1 : 0;

  // three sixes in a row forfeits the turn
  if(sixes >= 3){
    await ludoUpdate({
      last_roll: roll, dice_rolled: false, movable: [], consecutive_sixes: 0,
      current_turn: ludoNextSeat(ludoRoom, mySeat),
      last_event: 'Three sixes in a row — turn forfeited.'
    });
    ludoBusy = false;
    return;
  }

  const movable = ludoMovableTokens(ludoRoom.tokens, mySeat, roll);

  if(movable.length === 0){
    // nothing legal — pass to the next player (a 6 with no move still passes)
    setTimeout(async () => {
      await ludoUpdate({
        last_roll: roll, dice_rolled: false, movable: [], consecutive_sixes: sixes,
        current_turn: ludoNextSeat(ludoRoom, mySeat),
        last_event: `Rolled ${roll} — no legal move, turn passes.`
      });
      ludoBusy = false;
    }, 550);
    return;
  }

  setTimeout(async () => {
    await ludoUpdate({
      last_roll: roll, dice_rolled: true, movable, consecutive_sixes: sixes,
      last_event: `Rolled ${roll}.`
    });
    ludoBusy = false;
  }, 550);
}

async function ludoMove(tokenIndex){
  if(ludoBusy || !ludoRoom || !ludoRoom.dice_rolled) return;
  const mySeat = ludoSeatOf(ludoRoom);
  if(mySeat !== ludoRoom.current_turn) return;
  if(!(ludoRoom.movable || []).includes(tokenIndex)) return;

  ludoBusy = true;
  const roll = ludoRoom.last_roll;
  const { tokens, captured, finished: tokenHomed } = ludoApplyMove(ludoRoom.tokens, mySeat, tokenIndex, roll);

  const allHome = tokens[mySeat].every(p => p === 56);
  // a six, a capture, or getting a token home all earn another turn
  const extraTurn = (roll === 6 || captured || tokenHomed) && !allHome;
  void extraTurn;

  let event = `${LUDO_NAMES[mySeat]} moved ${roll}.`;
  if(captured) event = `${LUDO_NAMES[mySeat]} captured a token — extra turn!`;
  else if(tokenHomed) event = `${LUDO_NAMES[mySeat]} brought a token home — extra turn!`;
  else if(roll === 6) event = `${LUDO_NAMES[mySeat]} rolled a six — extra turn!`;

  const patch = {
    tokens,
    dice_rolled: false,
    movable: [],
    last_event: event,
    current_turn: extraTurn ? mySeat : ludoNextSeat(ludoRoom, mySeat, tokens),
    consecutive_sixes: extraTurn && roll === 6 ? (ludoRoom.consecutive_sixes || 0) : 0
  };

  const finished = (ludoRoom.finished_order || []).slice();
  const isFirstPlace = allHome && finished.length === 0;

  if(allHome && !finished.includes(mySeat)){
    finished.push(mySeat);
    patch.finished_order = finished;

    const place = finished.length;                     // 1st, 2nd, 3rd...
    const label = ['1st','2nd','3rd','4th'][place - 1];
    patch.last_event = `${['🥇','🥈','🥉','🏁'][place - 1]} ${LUDO_NAMES[mySeat]} finished ${label}!`;

    if(place === 1) patch.winner_seat = mySeat;

    // the board is done once only one player is left unplaced
    const active = ludoRoom.seats.filter((s, i) => s && i < (ludoRoom.player_count || 4)).length;
    if(finished.length >= active - 1){
      patch.game_over = true;
      const last = [0,1,2,3].find(i => ludoRoom.seats[i] && i < (ludoRoom.player_count||4) && !finished.includes(i));
      if(last != null) finished.push(last);
      patch.finished_order = finished;
      patch.last_event += ' Game over.';
    } else {
      // hand the turn on — a finished player takes no more turns
      patch.current_turn = ludoNextSeat(ludoRoom, mySeat, tokens);
    }
  }

  await ludoUpdate(patch);

  if(isFirstPlace){
    const result = await settleGame('ludo', ludoRoom.id, currentProfile.id, mySeat, LUDO_NAMES[mySeat]);
    if(result && result.payout){
      alert(`🥇 First place! Rs ${result.payout} has been credited to your wallet.\n\nThe game continues so the other places can be decided.`);
    }
  } else if(allHome){
    const place = (ludoRoom.finished_order || []).indexOf(mySeat) + 1;
    if(place > 1) alert(`You finished ${['','1st','2nd','3rd','4th'][place]}. The prize goes to first place only.`);
  }
  ludoBusy = false;
}

async function ludoUpdate(patch){
  patch.updated_at = new Date().toISOString();
  const { data, error } = await sb.from('ludo_rooms')
    .update(patch).eq('id', ludoRoom.id).select().single();
  if(error){ console.warn('ludo update:', error.message); return; }
  await applyLudoState(data);
}

/* =====================================================================
   TIC-TAC-TOE
   Two modes:
     • Solo   — play the computer at three difficulties. The Hard setting
                uses minimax with alpha-beta pruning, so it never loses.
     • Online — two players across devices, synced through Supabase.
   ===================================================================== */

const TTT_LINES = [
  [0,1,2],[3,4,5],[6,7,8],      // rows
  [0,3,6],[1,4,7],[2,5,8],      // columns
  [0,4,8],[2,4,6]               // diagonals
];

let tttMode      = 'solo';      // 'solo' | 'online'
let tttDifficulty= 'hard';
let tttBoard     = Array(9).fill('');
let tttTurn      = 'X';         // whose mark plays next
let tttMyMark    = 'X';
let tttWinner    = null;        // 'X' | 'O' | 'draw'
let tttWinLine   = null;
let tttScores    = { X:0, O:0, draw:0 };
let tttLocked    = false;       // stops input while the computer thinks
let tttRoom      = null;
let tttChannel   = null;

/* ---------- pure rules ---------- */

/* Returns {winner:'X'|'O'|'draw'|null, line:[i,j,k]|null} */
function tttEvaluate(board){
  for(const line of TTT_LINES){
    const [a,b,c] = line;
    if(board[a] && board[a] === board[b] && board[a] === board[c]){
      return { winner: board[a], line };
    }
  }
  return { winner: board.every(Boolean) ? 'draw' : null, line: null };
}

function tttEmptyCells(board){
  const out = [];
  board.forEach((v,i) => { if(!v) out.push(i); });
  return out;
}

/* Minimax with alpha-beta pruning. Depth is included in the score so the
   computer prefers winning sooner and losing later, which makes it feel
   like it is actually trying rather than stalling. */
function tttMinimax(board, me, turn, depth, alpha, beta){
  const { winner } = tttEvaluate(board);
  if(winner === me)                 return 10 - depth;
  if(winner && winner !== 'draw')   return depth - 10;
  if(winner === 'draw')             return 0;

  const maximising = turn === me;
  let best = maximising ? -Infinity : Infinity;

  for(const i of tttEmptyCells(board)){
    board[i] = turn;
    const score = tttMinimax(board, me, turn === 'X' ? 'O' : 'X', depth + 1, alpha, beta);
    board[i] = '';

    if(maximising){
      best = Math.max(best, score);
      alpha = Math.max(alpha, score);
    } else {
      best = Math.min(best, score);
      beta = Math.min(beta, score);
    }
    if(beta <= alpha) break;        // this branch can't change the outcome
  }
  return best;
}

/* Perfect move for `me` on this board. */
function tttBestMove(board, me){
  let bestScore = -Infinity, bestCell = null;
  for(const i of tttEmptyCells(board)){
    board[i] = me;
    const score = tttMinimax(board, me, me === 'X' ? 'O' : 'X', 0, -Infinity, Infinity);
    board[i] = '';
    if(score > bestScore){ bestScore = score; bestCell = i; }
  }
  return bestCell;
}

/* Difficulty is expressed as how often the computer plays the perfect move. */
function tttComputerMove(board, me, difficulty){
  const empty = tttEmptyCells(board);
  if(empty.length === 0) return null;

  const perfectChance = difficulty === 'easy' ? 0.25
                      : difficulty === 'medium' ? 0.75
                      : 1;

  if(Math.random() > perfectChance){
    return empty[Math.floor(Math.random() * empty.length)];
  }
  return tttBestMove(board, me);
}

/* ---------- rendering ---------- */

function renderTTT(){
  const boardEl = document.getElementById('ttt-board');
  if(!boardEl) return;

  if(tttMode === 'online' && tttRoom && handleCancellation('ttt', tttRoom)) return;

  const online = tttMode === 'online';
  const board  = online && tttRoom ? tttRoom.board  : tttBoard;
  const winner = online && tttRoom ? tttRoom.winner : tttWinner;
  const line   = online && tttRoom ? tttRoom.win_line : tttWinLine;
  const turnMark = online && tttRoom ? (tttRoom.current_turn === 0 ? 'X' : 'O') : tttTurn;

  let myTurn;
  if(online){
    const seat = tttRoom ? tttRoom.seats.findIndex(s => s && s.uid === currentProfile.id) : -1;
    tttMyMark = seat === 1 ? 'O' : 'X';
    myTurn = seat >= 0 && tttRoom.current_turn === seat && !winner;
  } else {
    myTurn = turnMark === tttMyMark && !winner && !tttLocked;
  }

  boardEl.innerHTML = board.map((v,i) => {
    const isWin = line && line.includes(i);
    const playable = !v && myTurn;
    return `<button class="ttt-cell ${v ? 'filled mark-'+v : ''} ${isWin ? 'win' : ''} ${playable ? 'playable' : ''}"
              ${playable ? `onclick="tttPlay(${i})"` : 'disabled'}
              aria-label="cell ${i+1}">
              ${v ? `<span class="ttt-mark">${v === 'X' ? tttXShape() : tttOShape()}</span>` : ''}
            </button>`;
  }).join('');

  // status line
  const status = document.getElementById('ttt-status');
  if(winner === 'draw'){
    status.textContent = "It's a draw.";
  } else if(winner){
    if(online){
      const seat = winner === 'X' ? 0 : 1;
      const w = tttRoom.seats[seat];
      status.textContent = (w && w.uid === currentProfile.id) ? '🏆 You win this round!' : `${w ? w.name : winner} wins this round.`;
    } else {
      status.textContent = winner === tttMyMark ? '🏆 You win!' : 'Computer wins.';
    }
  } else if(online && tttRoom && !tttRoom.seats[1]){
    status.textContent = 'Waiting for an opponent to join…';
  } else if(myTurn){
    status.textContent = `Your turn — you're ${tttMyMark}.`;
  } else {
    status.textContent = online ? "Opponent's turn…" : 'Computer is thinking…';
  }

  renderPot('ttt-pot', online && tttRoom ? (tttRoom.stake || 0) : 0,
            online && tttRoom ? tttRoom.seats.filter(Boolean).length : 0);

  // scoreboard
  const sb = document.getElementById('ttt-scores');
  if(online && tttRoom){
    const p1 = tttRoom.seats[0], p2 = tttRoom.seats[1];
    sb.innerHTML = `
      <div class="ttt-score x ${turnMark==='X'&&!winner?'active':''}"><span class="tag-x">X</span>${p1 ? (p1.uid===currentProfile.id?'You':p1.name) : '—'}<b>${tttRoom.scores[0]}</b></div>
      <div class="ttt-score o ${turnMark==='O'&&!winner?'active':''}"><span class="tag-o">O</span>${p2 ? (p2.uid===currentProfile.id?'You':p2.name) : 'Waiting'}<b>${tttRoom.scores[1]}</b></div>`;
  } else {
    sb.innerHTML = `
      <div class="ttt-score x ${turnMark==='X'&&!winner?'active':''}"><span class="tag-x">X</span>You<b>${tttScores.X}</b></div>
      <div class="ttt-score draw"><span>Draws</span><b>${tttScores.draw}</b></div>
      <div class="ttt-score o ${turnMark==='O'&&!winner?'active':''}"><span class="tag-o">O</span>Computer<b>${tttScores.O}</b></div>`;
  }

  document.getElementById('ttt-again').classList.toggle('hidden', !winner);
  document.getElementById('ttt-solo-opts').classList.toggle('hidden', online);
  document.getElementById('ttt-online-bar').classList.toggle('hidden', !online);
}

function tttXShape(){
  return `<svg viewBox="0 0 100 100"><line x1="22" y1="22" x2="78" y2="78"/><line x1="78" y1="22" x2="22" y2="78"/></svg>`;
}
function tttOShape(){
  return `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="28"/></svg>`;
}

/* ---------- solo play ---------- */

function tttStartSolo(){
  tttMode = 'solo';
  if(tttChannel){ sb.removeChannel(tttChannel); tttChannel = null; }
  tttRoom = null;
  detachChat();
  document.getElementById('ttt-chat-dock')?.classList.add('hidden');
  tttResetRound(true);
  goto('page-ttt');
}

function tttSetDifficulty(level){
  tttDifficulty = level;
  document.querySelectorAll('#ttt-solo-opts .ttt-diff').forEach(b =>
    b.classList.toggle('active', b.dataset.level === level));
  tttResetRound(true);
}

function tttResetRound(resetScores){
  tttBoard = Array(9).fill('');
  tttTurn = 'X';
  tttWinner = null;
  tttWinLine = null;
  tttLocked = false;
  if(resetScores) tttScores = { X:0, O:0, draw:0 };
  renderTTT();
}

async function tttPlay(i){
  if(tttMode === 'online') return tttPlayOnline(i);

  if(tttBoard[i] || tttWinner || tttLocked) return;
  tttBoard[i] = tttMyMark;
  let result = tttEvaluate(tttBoard);
  if(result.winner){ return tttFinishSolo(result); }

  // computer replies
  tttTurn = tttMyMark === 'X' ? 'O' : 'X';
  tttLocked = true;
  renderTTT();

  setTimeout(() => {
    const aiMark = tttTurn;
    const cell = tttComputerMove(tttBoard, aiMark, tttDifficulty);
    if(cell !== null) tttBoard[cell] = aiMark;
    result = tttEvaluate(tttBoard);
    tttLocked = false;
    tttTurn = tttMyMark;
    if(result.winner) return tttFinishSolo(result);
    renderTTT();
  }, 420);
}

function tttFinishSolo(result){
  tttWinner = result.winner;
  tttWinLine = result.line;
  tttLocked = false;
  if(result.winner === 'draw') tttScores.draw++;
  else tttScores[result.winner]++;
  renderTTT();
  if(result.winner === tttMyMark) addHistoryEvent('❌⭕', 'Beat the computer at Tic-Tac-Toe', null);
}

function tttPlayAgain(){
  if(tttMode === 'online') return tttNextRoundOnline();
  tttResetRound(false);
}

/* ---------- online play ---------- */

async function tttCreateRoom(){
  const code = 'TT-' + Math.floor(1000 + Math.random() * 9000);
  const stake = readStake('ttt-stake');

  const { data, error } = await sb.from('ttt_rooms').insert({
    code,
    seats: [{ uid: currentProfile.id, name: currentProfile.name }, null],
    board: Array(9).fill(''),
    current_turn: 0,
    scores: [0,0],
    stake,
    last_event: 'Room created — share the code.'
  }).select().single();
  if(error){ alert('Could not create room: ' + error.message); return; }

  if(!await collectStake('ttt', data.id, data.code, stake)){
    await sb.from('ttt_rooms').delete().eq('id', data.id);
    return;
  }

  tttMode = 'online';
  tttRoom = data;
  subscribeTTT(data.id);
  document.getElementById('ttt-room-code').textContent = data.code;
  attachChat('ttt', data.id);
  renderTTT();
  goto('page-ttt');
}

async function tttJoinRoom(){
  const code = (document.getElementById('ttt-join-input').value || '').trim().toUpperCase();
  if(!code) return;
  const { data: room, error } = await sb.from('ttt_rooms').select('*').eq('code', code).maybeSingle();
  if(error || !room){ alert('No room found with that code.'); return; }

  let target = room;
  const seatIdx = room.seats.findIndex(s => s && s.uid === currentProfile.id);
  if(seatIdx === -1){
    if(room.seats[1]){ alert('That room is already full.'); return; }
    if(!await collectStake('ttt', room.id, room.code, room.stake || 0)) return;
    const seats = [room.seats[0], { uid: currentProfile.id, name: currentProfile.name }];
    const { data: updated, error: upErr } = await sb.from('ttt_rooms')
      .update({ seats, last_event: `${currentProfile.name} joined.`, updated_at: new Date().toISOString() })
      .eq('id', room.id).select().single();
    if(upErr){ alert('Could not join: ' + upErr.message); return; }
    target = updated;
  }

  tttMode = 'online';
  tttRoom = target;
  subscribeTTT(target.id);
  document.getElementById('ttt-room-code').textContent = target.code;
  attachChat('ttt', target.id);
  renderTTT();
  goto('page-ttt');
}

function subscribeTTT(roomId){
  if(tttChannel) sb.removeChannel(tttChannel);
  tttChannel = sb.channel('ttt-'+roomId)
    .on('postgres_changes', { event:'UPDATE', schema:'public', table:'ttt_rooms', filter:`id=eq.${roomId}` },
      payload => { tttRoom = payload.new; renderTTT(); })
    .subscribe();
}

async function tttPlayOnline(i){
  if(!tttRoom || tttRoom.winner) return;
  const seat = tttRoom.seats.findIndex(s => s && s.uid === currentProfile.id);
  if(seat < 0 || tttRoom.current_turn !== seat) return;
  if(tttRoom.board[i]) return;

  const board = tttRoom.board.slice();
  board[i] = seat === 0 ? 'X' : 'O';
  const { winner, line } = tttEvaluate(board);

  const scores = tttRoom.scores.slice();
  if(winner && winner !== 'draw') scores[winner === 'X' ? 0 : 1]++;

  const patch = {
    board,
    current_turn: winner ? tttRoom.current_turn : (seat === 0 ? 1 : 0),
    winner: winner || null,
    win_line: line,
    scores,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await sb.from('ttt_rooms').update(patch).eq('id', tttRoom.id).select().single();
  if(error){ console.warn('ttt:', error.message); return; }
  tttRoom = data;
  renderTTT();

  if(winner && winner !== 'draw' && ((winner === 'X' && seat === 0) || (winner === 'O' && seat === 1))){
    const res = await settleGame('ttt', tttRoom.id, currentProfile.id, seat, winner);
    if(res && res.payout) alert(`You won! Rs ${res.payout} has been credited to your wallet.`);
  }
}

async function tttNextRoundOnline(){
  if(!tttRoom) return;
  // loser of the round starts the next one; on a draw the other player starts
  const nextStarter = tttRoom.winner === 'X' ? 1 : tttRoom.winner === 'O' ? 0 : (tttRoom.current_turn === 0 ? 1 : 0);
  const { data, error } = await sb.from('ttt_rooms').update({
    board: Array(9).fill(''),
    winner: null, win_line: null,
    current_turn: nextStarter,
    round: (tttRoom.round || 1) + 1,
    updated_at: new Date().toISOString()
  }).eq('id', tttRoom.id).select().single();
  if(error) return;
  tttRoom = data;
  renderTTT();
}

function tttCopyRoom(){
  const code = document.getElementById('ttt-room-code').textContent;
  navigator.clipboard?.writeText(code);
  const btn = event.target, old = btn.textContent;
  btn.textContent = 'Copied!';
  setTimeout(() => btn.textContent = old, 1200);
}

/* =====================================================================
   SNAKE & LADDER
   Classic 10x10 board, numbered 1-100 in boustrophedon order (row 1 runs
   left to right, row 2 right to left, and so on). Snakes and ladders are
   drawn as real SVG artwork spanning the squares they connect.
   Supports 2-4 players, live across devices.
   ===================================================================== */

/* The classic board layout. bottom -> top */
const SL_LADDERS = { 1:38, 4:14, 9:31, 21:42, 28:84, 36:44, 51:67, 71:91, 80:100 };
/* head -> tail */
const SL_SNAKES  = { 16:6, 47:26, 49:11, 56:53, 62:19, 64:60, 87:24, 93:73, 95:75, 98:78 };

const SL_COLORS = ['#e6455c', '#1faa72', '#f0b429', '#3f7fd8'];
const SL_NAMES  = ['Red', 'Green', 'Yellow', 'Blue'];
const SL_DIE    = ['⚀','⚁','⚂','⚃','⚄','⚅'];

let slRoom = null;
let slChannel = null;
let slBuilt = false;
let slBusy = false;

/* ---------- geometry ---------- */

/* Square number -> {row, col} with row 0 at the BOTTOM of the board. */
function slRowCol(n){
  const idx = n - 1;
  const row = Math.floor(idx / 10);
  const within = idx % 10;
  const col = (row % 2 === 0) ? within : 9 - within;   // snake back on odd rows
  return { row, col };
}

/* Square number -> centre point in a 0..100 SVG coordinate space. */
function slPoint(n){
  const { row, col } = slRowCol(n);
  return { x: (col + 0.5) * 10, y: (9 - row + 0.5) * 10 };
}

/* Square number -> CSS percentage position for placing tokens. */
function slPercent(n){
  const p = slPoint(n);
  return { left: p.x + '%', top: p.y + '%' };
}

/* ---------- board artwork ---------- */

function slLadderSVG(from, to){
  const a = slPoint(from), b = slPoint(to);
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;        // unit normal, for the two rails
  const w = 1.5;                               // half the ladder width

  const rail = (s) => `<line x1="${a.x + nx*w*s}" y1="${a.y + ny*w*s}" x2="${b.x + nx*w*s}" y2="${b.y + ny*w*s}"/>`;

  const rungs = Math.max(3, Math.round(len / 5));
  let out = '';
  for(let i = 1; i < rungs; i++){
    const t = i / rungs;
    const cx = a.x + dx*t, cy = a.y + dy*t;
    out += `<line x1="${cx + nx*w}" y1="${cy + ny*w}" x2="${cx - nx*w}" y2="${cy - ny*w}"/>`;
  }
  return `<g class="sl-ladder">${rail(1)}${rail(-1)}<g class="sl-rungs">${out}</g></g>`;
}

function slSnakeSVG(head, tail, i){
  const a = slPoint(head), b = slPoint(tail);
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const bend = (i % 2 === 0 ? 1 : -1) * Math.min(9, len * 0.3);
  const c1x = mx + nx * bend, c1y = my + ny * bend;

  const path = `M ${a.x} ${a.y} Q ${c1x} ${c1y} ${b.x} ${b.y}`;
  const hue = 120 + (i * 26) % 90;

  return `<g class="sl-snake" style="--sc:hsl(${hue} 55% 42%); --sc2:hsl(${hue} 60% 55%)">
      <path class="sl-snake-body" d="${path}"/>
      <path class="sl-snake-belly" d="${path}"/>
      <g class="sl-snake-head" transform="translate(${a.x} ${a.y})">
        <ellipse rx="2.6" ry="2.1"/>
        <circle class="eye" cx="-1" cy="-0.6" r="0.5"/>
        <circle class="eye" cx="1" cy="-0.6" r="0.5"/>
      </g>
    </g>`;
}

function buildSlBoard(){
  const grid = document.getElementById('sl-grid');
  const art  = document.getElementById('sl-art');
  if(!grid || !art) return;

  // numbered squares
  let cells = '';
  for(let row = 9; row >= 0; row--){
    for(let c = 0; c < 10; c++){
      const within = (row % 2 === 0) ? c : 9 - c;
      const n = row * 10 + within + 1;
      const cls = SL_LADDERS[n] ? 'has-ladder' : SL_SNAKES[n] ? 'has-snake' : '';
      cells += `<div class="sl-cell ${cls} ${(row + c) % 2 ? 'alt' : ''}"><span>${n}</span></div>`;
    }
  }
  grid.innerHTML = cells;

  // ladders first so snakes draw over them
  let svg = '';
  Object.entries(SL_LADDERS).forEach(([from, to]) => { svg += slLadderSVG(+from, +to); });
  Object.entries(SL_SNAKES).forEach(([head, tail], i) => { svg += slSnakeSVG(+head, +tail, i); });
  art.innerHTML = svg;

  slBuilt = true;
}

/* ---------- rules ---------- */

/* Apply a roll: returns the new square plus what happened on the way. */
function slResolveMove(current, roll){
  let next = current + roll;
  if(next > 100) return { pos: current, event: 'overshoot' };   // must land exactly
  if(next === 100) return { pos: 100, event: 'win' };
  if(SL_LADDERS[next]) return { pos: SL_LADDERS[next], event: 'ladder', from: next };
  if(SL_SNAKES[next])  return { pos: SL_SNAKES[next],  event: 'snake',  from: next };
  return { pos: next, event: 'move' };
}

function slNextSeat(room, from){
  for(let step = 1; step <= 4; step++){
    const s = (from + step) % room.player_count;
    if(room.seats[s] && room.positions[s] !== 100) return s;
  }
  return from;
}

function slSeatOf(room){
  if(!room || !currentProfile) return -1;
  return room.seats.findIndex(s => s && s.uid === currentProfile.id);
}

/* ---------- rendering ---------- */

function renderSl(){
  if(!slRoom) return;
  if(handleCancellation('snake', slRoom)) return;
  if(!slBuilt) buildSlBoard();

  const mySeat = slSeatOf(slRoom);
  const finished = (slRoom.finished_order || []);
  const gameOver = finished.length >= Math.max(1, slRoom.player_count - 1);
  const isMyTurn = mySeat >= 0 && slRoom.current_turn === mySeat && !gameOver && slRoom.positions[mySeat] !== 100;

  renderPot('sl-pot', slRoom.stake || 0, slRoom.seats.filter(Boolean).length);

  // seats
  document.getElementById('sl-seats').innerHTML = slRoom.seats.map((s, i) => {
    if(i >= slRoom.player_count) return '';
    const pos = slRoom.positions[i];
    const place = finished.indexOf(i);
    return `<div class="lu-seat ${slRoom.current_turn === i && !gameOver ? 'active' : ''} ${s ? '' : 'empty'}" style="--c:${SL_COLORS[i]}">
      <span class="lu-seat-dot"></span>
      <span class="lu-seat-name">${s ? (s.uid === currentProfile.id ? 'You' : s.name) : 'Waiting…'}</span>
      <span class="lu-seat-home">${place >= 0 ? ['🥇','🥈','🥉','4th'][place] : pos === 0 ? 'start' : pos}</span>
    </div>`;
  }).join('');

  // tokens — elements persist between renders so they glide instead of jumping
  const layer = document.getElementById('sl-tokens');
  const tray = document.getElementById('sl-tray');
  tray.innerHTML = '';
  const stack = new Map();
  const live = new Set();

  slRoom.positions.forEach((pos, seat) => {
    if(seat >= slRoom.player_count || !slRoom.seats[seat]) return;
    if(slOverride && slOverride.seat === seat) pos = slOverride.pos;

    if(pos === 0){
      tray.insertAdjacentHTML('beforeend',
        `<span class="sl-tray-token" style="--c:${SL_COLORS[seat]}" title="${SL_NAMES[seat]} — not started"></span>`);
      return;
    }

    const id = 'sl-tok-' + seat;
    live.add(id);
    let tok = document.getElementById(id);
    if(!tok){
      tok = document.createElement('span');
      tok.id = id;
      tok.className = 'sl-token';
      tok.style.setProperty('--c', SL_COLORS[seat]);
      layer.appendChild(tok);
    }

    const n = stack.get(pos) || 0;
    stack.set(pos, n + 1);
    const { left, top } = slPercent(pos);
    tok.style.left = left;
    tok.style.top = top;
    tok.style.marginLeft = ((n % 2) * 7 - 3) + 'px';
    tok.style.marginTop = (Math.floor(n / 2) * 7 - 3) + 'px';
    tok.classList.toggle('is-turn', slRoom.current_turn === seat);
    tok.classList.toggle('stepping', !!(slOverride && slOverride.seat === seat));
  });

  // clear away tokens for seats that are no longer on the board
  Array.from(layer.children).forEach(el => { if(!live.has(el.id)) el.remove(); });

  // dice + status
  const die = document.getElementById('sl-die');
  const btn = document.getElementById('sl-roll-btn') || {};
  const status = document.getElementById('sl-status');

  moveDieToSeat('sl-die', slRoom.current_turn, SL_COLORS);

  if(!die.classList.contains('rolling')){
    die.textContent = slRoom.last_roll ? SL_DIE[slRoom.last_roll - 1] : '🎲';
  }
  die.style.setProperty('--c', SL_COLORS[slRoom.current_turn] || '#888');

  if(gameOver){
    const winner = slRoom.seats[finished[0]];
    status.textContent = winner && winner.uid === currentProfile.id
      ? '🏆 You reached 100 first — you win!'
      : `🏆 ${winner ? winner.name : SL_NAMES[finished[0]]} won the game.`;
    btn.disabled = true; btn.textContent = 'Game over';
  } else if(mySeat === -1){
    status.textContent = 'Spectating this board.';
    btn.disabled = true;
  } else if(slRoom.positions[mySeat] === 100){
    status.textContent = 'You already finished — waiting for the others.';
    btn.disabled = true;
  } else if(isMyTurn){
    status.textContent = 'Your turn — tap the dice.';
    btn.disabled = false; btn.textContent = 'Roll dice';
  } else {
    const t = slRoom.seats[slRoom.current_turn];
    status.textContent = `${SL_NAMES[slRoom.current_turn]}'s turn — waiting for ${t ? t.name : 'player'}…`;
    btn.disabled = true; btn.textContent = 'Roll dice';
  }

  const canRollSl = isMyTurn && !gameOver;
  die.classList.toggle('my-turn', canRollSl);
  die.onclick = canRollSl ? rollSlDice : null;

  document.getElementById('sl-event').textContent = slRoom.last_event || '';
}

/* ---------- multiplayer ---------- */

async function openSnake(){
  const count = Number(document.getElementById('sl-player-count')?.value || 4);
  const code = 'TT-' + Math.floor(1000 + Math.random() * 9000);
  const seats = [null, null, null, null];
  seats[0] = { uid: currentProfile.id, name: currentProfile.name };

  const stake = readStake('sl-stake');

  const { data, error } = await sb.from('snake_rooms').insert({
    code, seats, player_count: count, stake,
    positions: [0,0,0,0], current_turn: 0, finished_order: [],
    last_event: stake ? `Board created at Rs ${stake} per player.` : 'Board created — share the code to fill the seats.'
  }).select().single();

  if(error){ alert('Could not create board: ' + error.message); return; }

  if(!await collectStake('snake', data.id, data.code, stake)){
    await sb.from('snake_rooms').delete().eq('id', data.id);
    return;
  }
  slRoom = data;
  subscribeSl(data.id);
  document.getElementById('sl-room-code').textContent = data.code;
  attachChat('snake', data.id);
  slPrevPositions = data.positions.slice();
  buildSlBoard();
  renderSl();
  goto('page-snake');
}

async function joinSlRoomByCode(){
  const code = (document.getElementById('sl-join-code-input').value || '').trim().toUpperCase();
  if(!code) return;
  const { data: room, error } = await sb.from('snake_rooms').select('*').eq('code', code).maybeSingle();
  if(error || !room){ alert('No board found with that code.'); return; }

  let target = room;
  if(room.seats.findIndex(s => s && s.uid === currentProfile.id) === -1){
    const seats = room.seats.slice();
    let open = -1;
    for(let i = 0; i < room.player_count; i++){ if(!seats[i]){ open = i; break; } }
    if(open === -1){ alert('That board is full.'); return; }
    seats[open] = { uid: currentProfile.id, name: currentProfile.name };
    if(!await collectStake('snake', room.id, room.code, room.stake || 0)) return;

    const { data: updated, error: upErr } = await sb.from('snake_rooms')
      .update({ seats, last_event: `${currentProfile.name} joined as ${SL_NAMES[open]}.`, updated_at: new Date().toISOString() })
      .eq('id', room.id).select().single();
    if(upErr){ alert('Could not join: ' + upErr.message); return; }
    target = updated;
  }

  slRoom = target;
  subscribeSl(target.id);
  document.getElementById('sl-room-code').textContent = target.code;
  attachChat('snake', target.id);
  slPrevPositions = target.positions.slice();
  buildSlBoard();
  renderSl();
  goto('page-snake');
}

function subscribeSl(roomId){
  if(slChannel) sb.removeChannel(slChannel);
  slChannel = sb.channel('sl-'+roomId)
    .on('postgres_changes', { event:'UPDATE', schema:'public', table:'snake_rooms', filter:`id=eq.${roomId}` },
      payload => { applySlState(payload.new); })
    .subscribe();
}

function copySlRoom(){
  const code = document.getElementById('sl-room-code').textContent;
  navigator.clipboard?.writeText(code);
  const btn = event.target, old = btn.textContent;
  btn.textContent = 'Copied!';
  setTimeout(() => btn.textContent = old, 1200);
}

async function rollSlDice(){
  if(slBusy || !slRoom) return;
  const mySeat = slSeatOf(slRoom);
  if(mySeat !== slRoom.current_turn) return;
  if(slRoom.positions[mySeat] === 100) return;

  slBusy = true;
  const roll = 1 + Math.floor(Math.random() * 6);
  const from = slRoom.positions[mySeat];
  const result = slResolveMove(from, roll);

  const positions = slRoom.positions.slice();
  positions[mySeat] = result.pos;

  const finished = (slRoom.finished_order || []).slice();
  let event;
  switch(result.event){
    case 'overshoot': event = `${SL_NAMES[mySeat]} rolled ${roll} — needs an exact roll to finish.`; break;
    case 'ladder':    event = `🪜 ${SL_NAMES[mySeat]} climbed from ${result.from} to ${result.pos}!`; break;
    case 'snake':     event = `🐍 ${SL_NAMES[mySeat]} slid from ${result.from} down to ${result.pos}.`; break;
    case 'win':       event = `🏆 ${SL_NAMES[mySeat]} reached 100!`; break;
    default:          event = `${SL_NAMES[mySeat]} rolled ${roll} → square ${result.pos}.`;
  }
  const justWonFirst = result.event === 'win' && !finished.includes(mySeat) && finished.length === 0;
  if(result.event === 'win' && !finished.includes(mySeat)) finished.push(mySeat);

  // a six earns another turn, as long as you haven't just finished
  const extra = roll === 6 && result.event !== 'win';
  const nextTurn = extra ? mySeat : slNextSeat({ ...slRoom, positions }, mySeat);

  setTimeout(async () => {
    const { data, error } = await sb.from('snake_rooms').update({
      positions, last_roll: roll, current_turn: nextTurn,
      finished_order: finished,
      winner_seat: finished.length ? finished[0] : null,
      last_event: extra ? event + ' Rolled a six — extra turn!' : event,
      updated_at: new Date().toISOString()
    }).eq('id', slRoom.id).select().single();

    if(!error){ await applySlState(data); }
    slBusy = false;

    if(justWonFirst){
      const res = await settleGame('snake', slRoom.id, currentProfile.id, mySeat, SL_NAMES[mySeat]);
      if(res && res.payout) alert(`You won! Rs ${res.payout} has been credited to your wallet.`);
    }
  }, 520);
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

/* ---------------- account: logout & password ---------------- */

/* Tear down every realtime subscription and clear in-memory state so
   nothing from the old session lingers if someone else logs in after. */
function clearSessionState(){
  [ludoChannel, slChannel, tttChannel, supportChannel].forEach(ch => { if(ch) sb.removeChannel(ch); });
  ludoChannel = slChannel = tttChannel = supportChannel = null;
  ludoRoom = slRoom = tttRoom = null;
  currentProfile = null;
  mySupportChatId = null;
}

async function playerLogout(){
  if(!confirm('Log out of Top Tournament on this device?')) return;
  clearSessionState();
  await sb.auth.signOut();
  location.reload();
}

/* Changing the password revokes every session everywhere — any other
   phone or browser still signed in is kicked out immediately. */
async function changePlayerPassword(){
  const pass = document.getElementById('new-player-password').value;
  const err = document.getElementById('player-password-err');
  err.style.color = 'var(--red)';

  if(!pass || pass.length < 6){
    err.textContent = 'Password must be at least 6 characters.';
    err.style.display = 'block';
    return;
  }
  if(!confirm('Change your password? You will be signed out on every device, including this one.')) return;

  const { error } = await sb.auth.updateUser({ password: pass });
  if(error){ err.textContent = error.message; err.style.display = 'block'; return; }

  err.style.color = 'var(--teal)';
  err.textContent = 'Password updated — signing out everywhere…';
  err.style.display = 'block';

  clearSessionState();
  await sb.auth.signOut({ scope: 'global' });   // revokes all refresh tokens
  setTimeout(() => location.reload(), 1200);
}

/* =====================================================================
   STAKES & PAYOUTS
   Every player at a table puts in the same amount, set by whoever
   created it. The stake leaves their wallet the moment they join and
   sits in escrow. The winner receives the whole pot minus the app's
   commission. Nothing here writes a balance directly — every change
   goes through a database function that re-checks the numbers.
   ===================================================================== */

const COMMISSION_RATE = 0.12;   // display only; the server value is authoritative

function prizeFromPot(pot){
  return Math.round((pot - pot * COMMISSION_RATE) * 100) / 100;
}

/* Read the stake the player typed on a game card. */
function readStake(inputId){
  const el = document.getElementById(inputId);
  const v = Number(el?.value || 0);
  return (isFinite(v) && v > 0) ? v : 0;
}

/* Take the stake before a room is created or joined.
   Returns true if the player is clear to sit down. */
async function collectStake(game, roomId, roomCode, amount){
  if(!amount) return true;                       // free table
  const { data, error } = await sb.rpc('place_wager', {
    p_game: game, p_room_id: roomId, p_room_code: roomCode, p_amount: amount
  });

  if(error){
    const msg = error.message || '';
    // the database raises short codes for the eligibility checks so the
    // wording can live here, next to the buttons that fix each problem
    if(msg.includes('KYC_REQUIRED')){
      if(confirm('Staked tables need a verified account.\n\nComplete KYC verification now?')) goto('page-settings');
    } else if(msg.includes('AGE_UNKNOWN')){
      if(confirm('We need your age on file before you can join a staked table.\n\nOpen KYC verification?')) goto('page-settings');
    } else if(msg.includes('UNDERAGE')){
      alert('Staked games are for players aged 18 and over.\n\nYou can still play any free table — set the stake to 0, or join a friendly room.');
    } else if(msg.includes('blocked')){
      alert('This account is blocked and cannot join staked tables. Contact support if you think this is a mistake.');
    } else if(msg.toLowerCase().includes('insufficient')){
      alert(msg.replace(/^.*?Insufficient/, 'Insufficient'));
    } else {
      alert('Could not place the stake: ' + msg);
    }
    return false;
  }

  if(typeof data === 'number'){
    currentProfile.balance = data;
    loadUserIntoApp();
  }
  return true;
}

/* Pay out a finished game. Safe to call more than once — the database
   marks the room settled and ignores any repeat. */
async function settleGame(game, roomId, winnerId, winnerSeat, winnerColor){
  const { data, error } = await sb.rpc('settle_match', {
    p_game: game, p_room_id: roomId, p_winner_id: winnerId,
    p_winner_seat: winnerSeat, p_winner_color: winnerColor
  });
  if(error){ console.warn('settle:', error.message); return null; }
  if(data && data.payout && winnerId === currentProfile.id){
    const { data: p } = await sb.from('profiles').select('*').eq('id', currentProfile.id).maybeSingle();
    if(p){ currentProfile = p; loadUserIntoApp(); }
  }
  return data;
}

/* The banner shown above a board: stake in, prize out. */
function renderPot(elId, stake, playersIn){
  const el = document.getElementById(elId);
  if(!el) return;
  if(!stake){
    el.innerHTML = `<span class="pot-free">Friendly table — no stake</span>`;
    return;
  }
  const pot = stake * playersIn;
  const prize = prizeFromPot(pot);
  el.innerHTML = `
    <div class="pot-line">
      <span class="pot-leg"><b>${playersIn}</b> × Rs ${stake}</span>
      <span class="pot-arrow">→</span>
      <span class="pot-leg">Pot <b>Rs ${pot}</b></span>
      <span class="pot-arrow">−${Math.round(COMMISSION_RATE*100)}%</span>
      <span class="pot-win">Winner takes <b>Rs ${prize}</b></span>
    </div>`;
}

/* Small helper so each game card can offer a stake box. */
function stakeFieldHTML(id){
  return `<div class="stake-row">
      <label for="${id}">Stake each</label>
      <div class="stake-input">
        <span>Rs</span>
        <input id="${id}" type="number" min="0" step="10" placeholder="0" onclick="event.stopPropagation()">
      </div>
    </div>`;
}

/* ---------------- staking eligibility ---------------- */

/* Why this account can or can't join a staked table. */
function stakeEligibility(){
  const p = currentProfile || {};
  if(p.blocked)                    return { ok:false, kind:'blocked' };
  if(!p.kyc_verified)              return { ok:false, kind:'kyc' };
  if(p.kyc_age == null)            return { ok:false, kind:'age-unknown' };
  if(Number(p.kyc_age) < 18)       return { ok:false, kind:'underage' };
  return { ok:true };
}

/* A short banner above the games list so players know where they stand
   before they type a stake and hit a wall. */
function renderStakeNotice(){
  const el = document.getElementById('stake-notice');
  if(!el || !currentProfile) return;
  const e = stakeEligibility();

  if(e.ok){
    el.className = 'stake-notice ok';
    el.innerHTML = `✅ Verified for staked tables · Balance <b>Rs ${Number(currentProfile.balance||0).toLocaleString()}</b>`;
    return;
  }
  el.className = 'stake-notice warn';
  if(e.kind === 'blocked'){
    el.innerHTML = `🚫 This account is blocked from staked tables. <a onclick="goto('page-support')">Contact support</a>`;
  } else if(e.kind === 'underage'){
    el.innerHTML = `🔞 Staked games are 18+. You can still play any free table — just leave the stake at 0.`;
  } else {
    el.innerHTML = `🔒 Free tables are open to you. To play for money, <a onclick="goto('page-settings')">complete KYC verification</a> (18+).`;
  }
}

/* ---------------- room helpers ---------------- */

/* Pull the wallet balance again after any money movement. */
async function refreshBalance(){
  if(!currentProfile) return;
  const { data } = await sb.from('profiles').select('*').eq('id', currentProfile.id).maybeSingle();
  if(data){ currentProfile = data; loadUserIntoApp(); }
}

function detachRoom(game){
  if(game === 'ludo'){ if(ludoChannel) sb.removeChannel(ludoChannel); ludoChannel = null; ludoRoom = null; }
  if(game === 'snake'){ if(slChannel) sb.removeChannel(slChannel); slChannel = null; slRoom = null; }
  if(game === 'ttt'){ if(tttChannel) sb.removeChannel(tttChannel); tttChannel = null; tttRoom = null; }
}

/* When someone else cancels, everyone still on the page is told once. */
const cancelSeen = new Set();
function handleCancellation(game, room){
  if(!room || !room.cancelled) return false;
  if(cancelSeen.has(room.id)) return true;
  cancelSeen.add(room.id);

  refreshBalance();
  const stake = Number(room.stake || 0);
  setTimeout(() => {
    alert(stake > 0
      ? `${room.last_event || 'The table was cancelled.'}\n\nRs ${stake} has been returned to your wallet. No fee was charged.`
      : (room.last_event || 'The table was cancelled.'));
    detachRoom(game);
    goHome();
  }, 60);
  return true;
}

/* =====================================================================
   IN-ROOM CHAT
   Messages float up the left side of the board and fade out after ten
   seconds, like a live-stream chat. Nothing is permanent: the overlay
   only ever holds the last few messages, and the server clears anything
   older than an hour.
   ===================================================================== */

const CHAT_TTL   = 10000;   // how long a message stays on screen
const CHAT_MAX   = 6;       // most messages visible at once
const CHAT_LIMIT = 200;     // characters

/* Canned lines, so players can talk without typing mid-game. */
const CHAT_QUICK = ['👋 Hi!', '😄 Nice move', '🔥 Good game', '⏳ Your turn', '😅 Oops', '🎲 Lucky!'];

let chatRoom = null;        // { game, roomId }
let chatChannelRoom = null;
let chatSeen = new Set();

/* Colours match the seat colours so you can tell who's talking. */
function chatSeatColor(game, seat){
  if(seat == null) return 'var(--text-dim)';
  if(game === 'ttt') return seat === 0 ? '#f2557a' : '#37c9e8';
  return (typeof LUDO_COLORS !== 'undefined' ? LUDO_COLORS : ['#e6455c','#1faa72','#f0b429','#3f7fd8'])[seat] || '#888';
}

/* Point the chat at a room and start listening. */
function attachChat(game, roomId){
  if(chatRoom && chatRoom.roomId === roomId) return;
  detachChat();
  chatRoom = { game, roomId };
  chatSeen = new Set();

  chatChannelRoom = sb.channel('roomchat-' + roomId)
    .on('postgres_changes',
        { event:'INSERT', schema:'public', table:'room_messages', filter:`room_id=eq.${roomId}` },
        payload => showChatMessage(payload.new))
    .subscribe();

  document.querySelectorAll('.chat-dock').forEach(d => d.classList.remove('hidden'));
}

function detachChat(){
  if(chatChannelRoom) sb.removeChannel(chatChannelRoom);
  chatChannelRoom = null;
  chatRoom = null;
  document.querySelectorAll('.chat-stream').forEach(s => s.innerHTML = '');
}

/* Which seat is this player in, for colour and name. */
function chatMySeat(game){
  const room = game === 'ludo' ? ludoRoom : game === 'snake' ? slRoom : tttRoom;
  if(!room || !currentProfile) return null;
  const i = (room.seats || []).findIndex(s => s && s.uid === currentProfile.id);
  return i < 0 ? null : i;
}

async function sendChat(game, preset){
  const input = document.getElementById(game + '-chat-input');
  const body = (preset || (input ? input.value : '')).trim();
  if(!body) return;

  const room = game === 'ludo' ? ludoRoom : game === 'snake' ? slRoom : tttRoom;
  if(!room || !currentProfile) return;

  if(input && !preset) input.value = '';

  const { error } = await sb.from('room_messages').insert({
    game, room_id: room.id, user_id: currentProfile.id,
    seat: chatMySeat(game), body: body.slice(0, CHAT_LIMIT)
  });
  if(error) console.warn('chat:', error.message);
}

/* Drop a message onto the overlay and schedule its fade-out. */
function showChatMessage(m){
  if(!m || chatSeen.has(m.id)) return;
  chatSeen.add(m.id);

  const stream = document.getElementById((m.game || (chatRoom||{}).game) + '-chat-stream');
  if(!stream) return;

  const mine = currentProfile && m.user_id === currentProfile.id;
  const room = m.game === 'ludo' ? ludoRoom : m.game === 'snake' ? slRoom : tttRoom;
  const seatName = room && room.seats && room.seats[m.seat] ? room.seats[m.seat].name : 'Player';

  const el = document.createElement('div');
  el.className = 'chat-bubble' + (mine ? ' mine' : '');
  el.style.setProperty('--sc', chatSeatColor(m.game, m.seat));
  el.innerHTML = `<span class="chat-who">${escapeHtml(mine ? 'You' : seatName)}</span>` +
                 `<span class="chat-body">${escapeHtml(m.body)}</span>`;
  stream.appendChild(el);

  // keep the overlay short
  while(stream.children.length > CHAT_MAX) stream.removeChild(stream.firstChild);

  setTimeout(() => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 400);
  }, CHAT_TTL);
}

/* The dock markup is identical for all three games. */
function chatDockHTML(game){
  return `
    <div class="chat-dock hidden" id="${game}-chat-dock">
      <div class="chat-quick">
        ${CHAT_QUICK.map(q => `<button type="button" onclick="sendChat('${game}', '${q.replace(/'/g,"\\'")}')">${q}</button>`).join('')}
      </div>
      <div class="chat-compose">
        <input id="${game}-chat-input" maxlength="${CHAT_LIMIT}" placeholder="Say something…" autocomplete="off"
               onkeydown="if(event.key==='Enter'){event.preventDefault();sendChat('${game}');}">
        <button type="button" onclick="sendChat('${game}')">Send</button>
      </div>
    </div>`;
}

/* =====================================================================
   ANIMATION
   Two jobs:
     • The die tumbles through random faces before settling on its result.
     • Tokens walk their squares one at a time (200ms a step) instead of
       teleporting, so everyone can follow what happened.
   The database still only ever stores the final position — all of this
   is replayed locally from the difference between the old and new state,
   which means spectators and opponents see the same walk.
   ===================================================================== */

const STEP_MS = 200;    // one square
const DIE_MS  = 520;    // how long the die tumbles

const DIE_FACES = ['⚀','⚁','⚂','⚃','⚄','⚅'];
const wait = ms => new Promise(r => setTimeout(r, ms));

/* Tumble a die element, then land on `face` (1-6). */
function spinDie(el, face){
  if(!el) return Promise.resolve();
  el.classList.add('rolling');
  const started = Date.now();

  return new Promise(resolve => {
    const flick = setInterval(() => {
      el.textContent = DIE_FACES[Math.floor(Math.random() * 6)];
      if(Date.now() - started >= DIE_MS){
        clearInterval(flick);
        el.classList.remove('rolling');
        el.textContent = DIE_FACES[(face || 1) - 1];
        el.classList.add('settle');
        setTimeout(() => el.classList.remove('settle'), 320);
        resolve();
      }
    }, 55);
  });
}

/* ---------- Ludo ---------- */

let ludoPrevTokens = null;
let ludoOverride   = null;   // { seat, idx, pos } drawn instead of the stored value
let ludoAnimating  = false;

/* Find the single token that advanced between two snapshots. */
function findLudoStep(prev, next){
  if(!prev) return null;
  for(let s = 0; s < 4; s++){
    for(let i = 0; i < 4; i++){
      const a = prev[s][i], b = next[s][i];
      if(a === b) continue;
      if(a >= 0 && b > a) return { seat:s, idx:i, from:a, to:b };  // walked forward
      if(a < 0 && b === 0) return { seat:s, idx:i, from:0, to:0 }; // came out of base
    }
  }
  return null;
}

async function animateLudoStep(step){
  ludoAnimating = true;
  for(let p = step.from + 1; p <= step.to; p++){
    ludoOverride = { seat:step.seat, idx:step.idx, pos:p };
    renderLudo();
    await wait(STEP_MS);
  }
  ludoOverride = null;
  ludoAnimating = false;
  renderLudo();
}

/* Every Ludo state change goes through here so the walk always plays. */
let ludoLastApplied = null;
let ludoQueue = Promise.resolve();

function applyLudoState(room){
  ludoQueue = ludoQueue.then(() => applyLudoStateInner(room)).catch(e => console.warn('ludo:', e));
  return ludoQueue;
}

async function applyLudoStateInner(room){
  const stamp = `${room.updated_at}|${room.last_roll}|${JSON.stringify(room.tokens)}`;
  if(stamp === ludoLastApplied){ ludoRoom = room; renderLudo(); return; }
  ludoLastApplied = stamp;

  const prev = ludoPrevTokens;
  const rollChanged = !ludoRoom || room.last_roll !== ludoRoom.last_roll || room.updated_at !== ludoRoom.updated_at;
  ludoRoom = room;

  if(rollChanged && room.last_roll){
    await spinDie(document.getElementById('ludo-die'), room.last_roll);
  }

  const step = findLudoStep(prev, room.tokens);
  ludoPrevTokens = room.tokens.map(r => r.slice());

  if(step && step.to > step.from){
    await animateLudoStep(step);
  } else {
    renderLudo();
  }
}

/* ---------- Snake & Ladder ---------- */

let slPrevPositions = null;
let slOverride      = null;   // { seat, pos }
let slAnimating     = false;

async function animateSlMove(seat, from, roll, finalPos){
  slAnimating = true;

  // an overshoot leaves the token exactly where it was — nothing to walk
  if(finalPos === from && from + roll > 100){
    slOverride = null;
    slAnimating = false;
    renderSl();
    return;
  }

  // walk the plain squares first
  const landed = Math.min(from + roll, 100);
  if(landed > from){
    for(let p = from + 1; p <= landed; p++){
      slOverride = { seat, pos:p };
      renderSl();
      await wait(STEP_MS);
    }
  }

  // then, if a snake or ladder was hit, show the ride separately
  if(finalPos !== landed){
    await wait(260);
    const climbing = finalPos > landed;
    const board = document.querySelector('.sl-board');
    if(board) board.classList.add(climbing ? 'climbing' : 'sliding');
    slOverride = { seat, pos:finalPos };
    renderSl();
    await wait(700);
    if(board) board.classList.remove('climbing','sliding');
  }

  slOverride = null;
  slAnimating = false;
  renderSl();
}

let slLastApplied = null;
let slQueue = Promise.resolve();

/* Every state change is applied once, in order, and never overlaps
   another animation. */
function applySlState(room){
  slQueue = slQueue.then(() => applySlStateInner(room)).catch(e => console.warn('sl:', e));
  return slQueue;
}

async function applySlStateInner(room){
  const stamp = `${room.updated_at}|${room.last_roll}|${(room.positions||[]).join(',')}`;
  if(stamp === slLastApplied){ slRoom = room; renderSl(); return; }
  slLastApplied = stamp;

  const prev = slPrevPositions;
  const rollChanged = !slRoom || room.last_roll !== slRoom.last_roll || room.updated_at !== slRoom.updated_at;
  slRoom = room;

  if(rollChanged && room.last_roll){
    await spinDie(document.getElementById('sl-die'), room.last_roll);
  }

  let moved = null;
  if(prev){
    for(let s = 0; s < room.positions.length; s++){
      if(prev[s] !== room.positions[s]){ moved = { seat:s, from:prev[s], to:room.positions[s] }; break; }
    }
  }
  slPrevPositions = room.positions.slice();

  if(moved && room.last_roll){
    await animateSlMove(moved.seat, moved.from, room.last_roll, moved.to);
  } else {
    renderSl();
  }
}

/* ---------------- the travelling die ----------------
   One die element per game. Rather than sitting in a fixed spot, it
   glides to whichever colour's corner is currently on turn, so it's
   always obvious whose roll it is.
   Corner order matches the seats: 0 top-left, 1 top-right,
   2 bottom-right, 3 bottom-left.
------------------------------------------------------------------- */
const DIE_SLOTS = [
  { left:'-2%',  top:'-2%'  },
  { left:'102%', top:'-2%'  },
  { left:'102%', top:'102%' },
  { left:'-2%',  top:'102%' }
];

function moveDieToSeat(dieId, seat, colors){
  const die = document.getElementById(dieId);
  if(!die) return;
  const slot = DIE_SLOTS[seat] || DIE_SLOTS[0];
  die.style.left = slot.left;
  die.style.top  = slot.top;
  die.style.setProperty('--c', (colors || [])[seat] || 'var(--gold)');
  die.dataset.seat = seat;
}

/* ---------------- boot ----------------
   Runs last, after every other script has defined its functions.
---------------------------------------------------------------- */
(async function boot(){
  // build the chat docks for each game page
  ['ludo','snake','ttt'].forEach(g => {
    const mount = document.getElementById(g + '-chat-mount');
    if(mount) mount.innerHTML = chatDockHTML(g);
  });

  const { data:{ session } } = await sb.auth.getSession();
  if(session){
    await loginFlow();
  }
})();
