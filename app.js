
(function(){
  const $ = (id)=>document.getElementById(id);

  // ---- helpers
  const ls = {
    get(k, d=null){ try{ const v = localStorage.getItem(k); return v===null? d: JSON.parse(v);}catch{ return d;} },
    set(k, v){ localStorage.setItem(k, JSON.stringify(v)); }
  };
  const now = ()=>new Date().toISOString();

  function logEvents(line){
    const el = $("events");
    el.textContent = `[${new Date().toLocaleTimeString()}] ${line}\n` + el.textContent;
  }
  function logDebug(obj){
    const el = $("debug");
    el.textContent = JSON.stringify(obj, null, 2);
  }
  function randCode(){
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no confusing I/O/1/0
    let s="";
    for(let i=0;i<6;i++) s+=chars[Math.floor(Math.random()*chars.length)];
    return s;
  }
  function uuid(){
    // crypto.randomUUID supported modern browsers
    return (crypto && crypto.randomUUID)? crypto.randomUUID() : String(Math.random()).slice(2)+String(Date.now());
  }

  // ---- config
  const cfg = window.RENTZ_CONFIG || {};
  if(!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_URL.includes("PASTE_")){
    logEvents("⚠️ Completează config.js cu SUPABASE_URL și SUPABASE_ANON_KEY (Publishable key).");
  }

  // ---- identity (no login)
  let player_id = ls.get("rentz_player_id");
  if(!player_id){ player_id = uuid(); ls.set("rentz_player_id", player_id); }
  let player_name = ls.get("rentz_player_name","Guest");
  $("playerId").textContent = player_id;
  $("playerName").textContent = player_name;
  $("inpName").value = player_name;

  $("btnSaveName").onclick = ()=>{
    const n = ($("inpName").value||"").trim().slice(0,24) || "Guest";
    player_name = n;
    ls.set("rentz_player_name", n);
    $("playerName").textContent = n;
    logEvents(`nume setat: ${n}`);
  };

  $("btnReset").onclick = ()=>{
    localStorage.removeItem("rentz_player_id");
    localStorage.removeItem("rentz_player_name");
    location.reload();
  };

  // ---- supabase client
  const supabase = (cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_URL.includes("PASTE_"))
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { realtime: { params: { eventsPerSecond: 10 } } })
    : null;

  // ---- room state
  let room = null;          // rooms row
  let my_seat = null;
  let subs = [];
  let players = [];

  function setRoomUI(){
    $("roomCode").textContent = room?.code || "—";
    $("roomStatus").textContent = room?.status || "—";
    $("mySeat").textContent = my_seat || "—";
    $("btnReady").disabled = !room;
    $("btnStart").disabled = !(room && room.host_id === player_id);
  }

  function renderPlayers(){
    const wrap = $("players");
    wrap.innerHTML = "";
    for(let seat=1; seat<=4; seat++){
      const p = players.find(x=>x.seat===seat);
      const div = document.createElement("div");
      div.className="player";
      const left = document.createElement("div");
      left.innerHTML = `<div style="font-weight:800">Seat ${seat}</div>
                        <div class="muted small">${p? `${p.name} • ${p.player_id.slice(0,8)}…` : "liber"}</div>`;
      const right = document.createElement("div");
      const badges = [];
      if(p){
        if(p.player_id === room?.host_id) badges.push(`<span class="badge host">host</span>`);
        badges.push(p.is_ready? `<span class="badge good">ready</span>` : `<span class="badge">not ready</span>`);
      } else {
        badges.push(`<span class="badge">empty</span>`);
      }
      right.innerHTML = badges.join(" ");
      div.appendChild(left);
      div.appendChild(right);
      wrap.appendChild(div);
    }
  }

  async function cleanupSubs(){
    for(const s of subs){
      try{ await supabase.removeChannel(s);}catch{}
    }
    subs = [];
  }

  async function fetchRoomByCode(code){
    const { data, error } = await supabase.from("rooms").select("*").eq("code", code).maybeSingle();
    if(error) throw error;
    return data;
  }

  async function fetchPlayers(room_id){
    const { data, error } = await supabase.from("room_players").select("*").eq("room_id", room_id).order("seat");
    if(error) throw error;
    return data || [];
  }

  async function insertEvent(room_id, type, payload){
    // get seq via SQL function next_room_seq
    const { data: seqData, error: seqErr } = await supabase.rpc("next_room_seq", { p_room_id: room_id });
    if(seqErr) throw seqErr;
    const seq = seqData;

    const { error } = await supabase.from("room_events").insert({
      room_id, seq, type, payload: payload || {}
    });
    if(error) throw error;
  }

  async function joinRoom(code){
    code = (code||"").trim().toUpperCase();
    if(code.length !== 6) throw new Error("Cod invalid (6 caractere).");

    const r = await fetchRoomByCode(code);
    if(!r) throw new Error("Camera nu există.");

    // load players and pick seat
    const ps = await fetchPlayers(r.id);
    if(ps.some(p=>p.player_id===player_id)){
      // already joined
      const me = ps.find(p=>p.player_id===player_id);
      room = r; players = ps; my_seat = me?.seat || null;
      setRoomUI(); renderPlayers();
    } else {
      if(ps.length >= 4) throw new Error("Camera este plină (4/4).");
      const taken = new Set(ps.map(p=>p.seat));
      let seat = null;
      for(let s=1;s<=4;s++){ if(!taken.has(s)){ seat=s; break; } }
      if(!seat) throw new Error("Nu există seat liber.");

      const { error } = await supabase.from("room_players").insert({
        room_id: r.id,
        player_id,
        name: player_name,
        seat,
        is_ready: false
      });
      if(error) throw error;

      room = r; my_seat = seat;
      players = await fetchPlayers(r.id);

      await insertEvent(r.id, "join", { player_id, name: player_name, seat });
      setRoomUI(); renderPlayers();
    }

    await setupRealtime(room.id);
    logEvents(`✅ în cameră: ${code} (seat ${my_seat})`);
  }

  async function createRoom(){
    const code = randCode();
    // create room with host_id=player_id
    const { data, error } = await supabase
      .from("rooms")
      .insert({ code, host_id: player_id, status: "lobby", state: {} })
      .select("*")
      .single();
    if(error) throw error;

    room = data;
    // host joins seat 1
    const { error: pErr } = await supabase.from("room_players").insert({
      room_id: room.id,
      player_id,
      name: player_name,
      seat: 1,
      is_ready: false
    });
    if(pErr) throw pErr;

    my_seat = 1;
    players = await fetchPlayers(room.id);

    await insertEvent(room.id, "create", { player_id, name: player_name, seat: 1, code });
    setRoomUI(); renderPlayers();
    $("inpCode").value = code;
    await setupRealtime(room.id);
    logEvents(`✅ cameră creată: ${code}`);
  }

  async function toggleReady(){
    if(!room) return;
    const me = players.find(p=>p.player_id===player_id);
    if(!me) return;
    const next = !me.is_ready;

    const { error } = await supabase
      .from("room_players")
      .update({ is_ready: next, name: player_name })
      .eq("room_id", room.id)
      .eq("player_id", player_id);
    if(error) throw error;

    await insertEvent(room.id, "ready", { player_id, ready: next });
    logEvents(`ready=${next}`);
  }

  async function startGame(){
    if(!room) return;
    if(room.host_id !== player_id) throw new Error("Doar host-ul poate porni.");

    const ps = await fetchPlayers(room.id);
    if(ps.length !== 4) throw new Error("Trebuie 4 jucători în cameră.");
    if(ps.some(p=>!p.is_ready)) throw new Error("Toți trebuie să fie ready.");

    const { error } = await supabase.from("rooms").update({ status: "playing" }).eq("id", room.id);
    if(error) throw error;

    await insertEvent(room.id, "start", { by: player_id });
    logEvents("🎮 Start!");
  }

  async function setupRealtime(room_id){
    await cleanupSubs();

    // Rooms changes (single room)
    const chRoom = supabase.channel(`room:${room_id}`)
      .on("postgres_changes", { event:"*", schema:"public", table:"rooms", filter:`id=eq.${room_id}` }, (payload)=>{
        if(payload.new) room = payload.new;
        setRoomUI();
        logDebug({ room });
      })
      .subscribe();
    subs.push(chRoom);

    // Players changes (room players)
    const chPlayers = supabase.channel(`players:${room_id}`)
      .on("postgres_changes", { event:"*", schema:"public", table:"room_players", filter:`room_id=eq.${room_id}` }, async ()=>{
        players = await fetchPlayers(room_id);
        renderPlayers();
        // update my seat if needed
        const me = players.find(p=>p.player_id===player_id);
        my_seat = me?.seat || my_seat;
        setRoomUI();
        logDebug({ room, players, my_seat });
      })
      .subscribe();
    subs.push(chPlayers);

    // Events (log)
    const chEvents = supabase.channel(`events:${room_id}`)
      .on("postgres_changes", { event:"INSERT", schema:"public", table:"room_events", filter:`room_id=eq.${room_id}` }, (payload)=>{
        const ev = payload.new;
        logEvents(`event #${ev.seq} ${ev.type} ${JSON.stringify(ev.payload)}`);
      })
      .subscribe();
    subs.push(chEvents);

    logEvents("📡 Realtime subscribed.");
  }

  // ---- wire UI
  $("btnCreate").onclick = async ()=>{
    try{
      if(!supabase) throw new Error("Config Supabase lipsă (config.js).");
      await createRoom();
    }catch(e){
      logEvents("❌ " + (e?.message || e));
      logDebug({ error: String(e), stack: e?.stack });
    }
  };

  $("btnJoin").onclick = async ()=>{
    try{
      if(!supabase) throw new Error("Config Supabase lipsă (config.js).");
      const code = $("inpCode").value;
      await joinRoom(code);
    }catch(e){
      logEvents("❌ " + (e?.message || e));
      logDebug({ error: String(e), stack: e?.stack });
    }
  };

  $("btnReady").onclick = async ()=>{
    try{
      await toggleReady();
    }catch(e){
      logEvents("❌ " + (e?.message || e));
      logDebug({ error: String(e), stack: e?.stack });
    }
  };

  $("btnStart").onclick = async ()=>{
    try{
      await startGame();
    }catch(e){
      logEvents("❌ " + (e?.message || e));
      logDebug({ error: String(e), stack: e?.stack });
    }
  };

  // initial debug
  setRoomUI();
  renderPlayers();
  logDebug({ player_id, player_name });

})();
