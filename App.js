import React, { useEffect, useState } from 'react';
import VoiceRoomScreen from './VoiceRoomScreen';
import AuthScreen from './AuthScreen';
import ProfileScreen from './ProfileScreen';
import { supabase } from './supabaseClient';
import { SafeAreaView, View, Text, ScrollView, Pressable, TextInput, StatusBar, StyleSheet } from 'react-native';

const C = { green: '#18C9A5', dark: '#07372F', bg: '#F3F7F5', ink: '#19312C', muted: '#82918D', white: '#FFFFFF' };
const rooms = [
  { name: 'استراحة Jehoo', host: 'فريق Jehoo', count: 128, emoji: '🎙️', tint: '#D8F8EC' },
  { name: 'سوالف المساء', host: 'ليالي الشام', count: 64, emoji: '🌙', tint: '#E5E7FF' },
  { name: 'أصدقاء الموسيقى', host: 'DJ Noor', count: 42, emoji: '🎵', tint: '#FFF0D8' },
  { name: 'تعارف وأصدقاء', host: 'غرفة عامة', count: 27, emoji: '💚', tint: '#DCEBFF' },
];
const gifts = [['🌹', 'وردة', '10'], ['💖', 'قلب', '50'], ['🌟', 'نجمة', '100'], ['👑', 'تاج', '500']];

function Button({ children, onPress, active = false }) {
  return <Pressable onPress={onPress} style={[s.pill, active && { backgroundColor: C.green }]}><Text style={{ color: active ? C.dark : C.muted, fontWeight: '700' }}>{children}</Text></Pressable>;
}
function Header({ title, subtitle }) {
  return <View style={s.header}><View><Text style={s.brand}>Jehoo <Text style={{ color: C.green }}>●</Text></Text><Text style={s.muted}>{subtitle}</Text></View><Text style={s.title}>{title}</Text></View>;
}
function Home({ openRoom }) {
  return <>
    <Header title="الرئيسية" subtitle="مساحتك، صوتك، أصدقاؤك" />
    <ScrollView contentContainerStyle={s.pad}>
      <View style={s.hero}><Text style={s.heroSmall}>أهلاً بك في Jehoo</Text><Text style={s.heroTitle}>اجتمعوا بالصوت 💚</Text><Text style={s.heroText}>غرف صوتية، أصدقاء جدد، وهدايا مميزة في مكان واحد.</Text><Pressable style={s.cta} onPress={() => openRoom(rooms[0])}><Text style={s.ctaText}>اكتشف الغرف ←</Text></Pressable></View>
      <View style={s.row}><Text style={s.heading}>الغرف الصوتية</Text><Text style={{ color: C.green }}>عرض الكل</Text></View>
      <View style={s.row}><Button active>🔥 نشطة</Button><Button>جديدة</Button><Button>أصدقائي</Button></View>
      {rooms.map(room => <Pressable key={room.name} onPress={() => openRoom(room)} style={s.room}><View style={[s.roomIcon, { backgroundColor: room.tint }]}><Text style={{ fontSize: 27 }}>{room.emoji}</Text></View><View style={{ flex: 1, alignItems: 'flex-end' }}><Text style={s.roomName}>{room.name}</Text><Text style={s.muted}>{room.host} · غرفة صوتية</Text><Text style={s.roomMeta}>🎧 {room.count} مستمعاً · 🎙️ 5 متحدثين</Text></View><Text style={s.chev}>‹</Text></Pressable>)}
      <Text style={[s.heading, { marginVertical: 14 }]}>الهدايا الرائجة</Text><View style={s.row}>{gifts.map(gift => <View key={gift[1]} style={s.gift}><Text style={{ fontSize: 25 }}>{gift[0]}</Text><Text style={s.roomName}>{gift[1]}</Text><Text style={s.muted}>🪙 {gift[2]}</Text></View>)}</View>
    </ScrollView>
  </>;
}
function Room({ room, back }) {
  const [mic, setMic] = useState(false);
  const [message, setMessage] = useState('');
  return <>
    <View style={s.roomHeader}><Pressable onPress={back}><Text style={{ color: '#8BEBD5' }}>رجوع ‹</Text></Pressable><Text style={s.heroTitle}>{room.name}</Text><Text style={{ color: '#C6E7DE' }}>بث صوتي تجريبي · {room.count} مستمعاً</Text></View>
    <ScrollView contentContainerStyle={s.pad}>
      <View style={s.roomBanner}><Text style={{ fontSize: 40 }}>🎙️</Text><Text style={s.heading}>أهلاً بكم في {room.name}</Text><Text style={s.muted}>يرجى احترام الجميع وإرشادات المجتمع.</Text></View>
      <Text style={s.heading}>المقاعد الصوتية</Text><View style={s.seats}>{['👑','🎙️','🎙️','🎙️','🎙️','🎙️','🎙️','🎙️','🎙️','🎙️'].map((icon, i) => <View key={i} style={s.seat}><View style={s.seatCircle}><Text style={{ fontSize: 22 }}>{icon}</Text></View><Text style={s.muted}>{i === 0 ? 'المضيف' : 'مقعد ' + i}</Text></View>)}</View>
      <Text style={s.heading}>دردشة الغرفة</Text><View style={s.bubble}><Text style={{ color: C.ink }}>💚 مرحباً بالجميع، نتمنى لكم وقتاً ممتعاً!</Text></View>
      <TextInput value={message} onChangeText={setMessage} placeholder="اكتب رسالة..." style={s.input} />
      <View style={s.row}><Button active onPress={() => setMic(!mic)}>{mic ? '🎙️ الميكروفون يعمل' : '🔇 تشغيل الميكروفون'}</Button><Button>🎁 هدية</Button><Button onPress={back}>خروج</Button></View>
      <Text style={s.muted}>واجهة أولية فقط: لا يوجد بث صوتي أو إرسال رسائل فعلي قبل ربط الخادم.</Text>
    </ScrollView>
  </>;
}
function Messages({ session }) {
  const user = session?.user;
  const [targetId, setTargetId] = useState('');
  const [target, setTarget] = useState(null);
  const [inbox, setInbox] = useState([]);
  const [items, setItems] = useState([]);
  const [text, setText] = useState('');
  const [blocked, setBlocked] = useState([]);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadInbox() {
    if (!user || !supabase) return;
    const { data, error: queryError } = await supabase.from('direct_messages')
      .select('id,sender_id,receiver_id,body,created_at,deleted_for_sender,deleted_for_receiver')
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`).order('created_at', { ascending: false }).limit(500);
    if (queryError) { setError('تعذّر تحميل الرسائل. تأكد من تطبيق ملف SQL في Supabase.'); return; }
    const visible = (data || []).filter(m => m.sender_id === user.id ? !m.deleted_for_sender : !m.deleted_for_receiver);
    const ids = [...new Set(visible.map(m => m.sender_id === user.id ? m.receiver_id : m.sender_id))];
    if (!ids.length) { setInbox([]); return; }
    const { data: profiles } = await supabase.from('profiles').select('id,public_id,display_name,avatar_url').in('id', ids);
    const byId = Object.fromEntries((profiles || []).map(p => [p.id, p]));
    const latest = new Map();
    visible.forEach(m => {
      const other = m.sender_id === user.id ? m.receiver_id : m.sender_id;
      if (!latest.has(other)) latest.set(other, { profile: byId[other] || { id: other, display_name: 'عضو Jehoo' }, message: m });
    });
    setInbox([...latest.values()]);
  }

  async function loadBlocked() {
    if (!user || !supabase) return;
    const { data } = await supabase.from('user_blocks').select('blocked_id').eq('blocker_id', user.id);
    setBlocked((data || []).map(x => x.blocked_id));
  }

  async function openByPublicId() {
    setError(''); setNotice('');
    if (!user) { setError('سجّل الدخول أولاً لاستخدام الرسائل الخاصة.'); return; }
    if (!supabase) { setError('أضف إعدادات Supabase أولاً.'); return; }
    if (!/^\d{6}$/.test(targetId)) { setError('أدخل ID مكوّناً من 6 أرقام.'); return; }
    setBusy(true);
    const { data, error: lookupError } = await supabase.from('profiles').select('id,public_id,display_name,avatar_url,bio').eq('public_id', Number(targetId)).maybeSingle();
    setBusy(false);
    if (lookupError || !data) { setError('لم نعثر على مستخدم بهذا الرقم.'); return; }
    if (data.id === user.id) { setError('هذا رقم حسابك أنت.'); return; }
    setTarget(data);
  }

  async function openProfile(profile) {
    setTarget(profile); setError(''); setNotice('');
    if (!user || !supabase) return;
    const [blockRes, followRes] = await Promise.all([
      supabase.from('user_blocks').select('id').eq('blocker_id', user.id).eq('blocked_id', profile.id).maybeSingle(),
      supabase.from('user_follows').select('id').eq('follower_id', user.id).eq('following_id', profile.id).maybeSingle()
    ]);
    setBlocked(prev => blockRes.data ? [...new Set([...prev, profile.id])] : prev.filter(id => id !== profile.id));
    setFollowing(!!followRes.data);
    const { data, error: loadError } = await supabase.from('direct_messages').select('id,sender_id,receiver_id,body,created_at,deleted_for_sender,deleted_for_receiver')
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${profile.id}),and(sender_id.eq.${profile.id},receiver_id.eq.${user.id})`)
      .order('created_at', { ascending: true }).limit(300);
    if (loadError) { setError('تعذّر فتح المحادثة.'); return; }
    setItems((data || []).filter(m => m.sender_id === user.id ? !m.deleted_for_sender : !m.deleted_for_receiver));
  }

  useEffect(() => { loadInbox(); loadBlocked(); }, [user?.id]);
  useEffect(() => {
    if (!target || !user || !supabase) return;
    const channel = supabase.channel('dm-' + [user.id, target.id].sort().join('-'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_messages' }, () => { openProfile(target); loadInbox(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [target?.id, user?.id]);

  async function sendMessage() {
    const body = text.trim();
    if (!body || !target || !user || !supabase || busy) return;
    if (blocked.includes(target.id)) { setError('أزل الحظر أولاً قبل المراسلة.'); return; }
    setBusy(true); setError('');
    const { error: sendError } = await supabase.from('direct_messages').insert({ sender_id: user.id, receiver_id: target.id, body });
    setBusy(false);
    if (sendError) setError('لم تُرسل الرسالة. قد يكون الطرف الآخر حظرك أو إعدادات قاعدة البيانات غير مكتملة.');
    else { setText(''); await openProfile(target); await loadInbox(); }
  }

  async function toggleFollow() {
    if (!user || !supabase || !target) return;
    if (following) {
      const { error: e } = await supabase.from('user_follows').delete().eq('follower_id', user.id).eq('following_id', target.id);
      if (e) setError('تعذّر إلغاء المتابعة.'); else setFollowing(false);
    } else {
      const { error: e } = await supabase.from('user_follows').insert({ follower_id: user.id, following_id: target.id });
      if (e) setError('تعذّرت المتابعة.'); else setFollowing(true);
    }
  }

  async function toggleBlock() {
    if (!user || !supabase || !target) return;
    if (blocked.includes(target.id)) {
      const { error: e } = await supabase.from('user_blocks').delete().eq('blocker_id', user.id).eq('blocked_id', target.id);
      if (e) setError('تعذّر إلغاء الحظر.'); else setBlocked(prev => prev.filter(id => id !== target.id));
    } else {
      const { error: e } = await supabase.from('user_blocks').insert({ blocker_id: user.id, blocked_id: target.id });
      if (e) setError('تعذّر الحظر.'); else { setBlocked(prev => [...prev, target.id]); setNotice('تم حظر المستخدم. لن تتمكن من مراسلته.'); }
    }
  }

  async function deleteConversation() {
    if (!user || !target || !supabase) return;
    setBusy(true);
    const a = await supabase.from('direct_messages').update({ deleted_for_sender: true }).eq('sender_id', user.id).eq('receiver_id', target.id);
    const b = await supabase.from('direct_messages').update({ deleted_for_receiver: true }).eq('receiver_id', user.id).eq('sender_id', target.id);
    setBusy(false);
    if (a.error || b.error) { setError('تعذّر حذف المحادثة.'); return; }
    setTarget(null); setItems([]); setNotice('تم حذف المحادثة من قائمتك.'); await loadInbox();
  }

  async function copyMessage(body) {
    try {
      const Clipboard = require('expo-clipboard');
      await Clipboard.setStringAsync(body);
      setNotice('تم نسخ الرسالة.');
    } catch (_) { setError('تعذّر النسخ؛ تحقق من تثبيت expo-clipboard.'); }
  }

  if (!user) return <><Header title="الرسائل" subtitle="رسائل خاصة وأصدقاء" /><View style={s.empty}><Text style={{fontSize:42}}>🔐</Text><Text style={s.heading}>سجّل الدخول للمراسلة</Text><Text style={s.muted}>المحادثات خاصة وتتطلب حساباً.</Text></View></>;
  return <><Header title="الرسائل" subtitle="مراسلة خاصة · متابعة · حظر" />
    <ScrollView style={{flex:1}} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <View style={s.row}><TextInput value={targetId} onChangeText={v=>setTargetId(v.replace(/\D/g,'').slice(0,6))} keyboardType="number-pad" maxLength={6} placeholder="ابحث برقم المستخدم (6 أرقام)" style={[s.input,{flex:1,marginVertical:0}]} /><Pressable style={s.cta} onPress={openByPublicId} disabled={busy}><Text style={s.ctaText}>بحث</Text></Pressable></View>
      {!!error && <Text style={{color:'#B42318',textAlign:'right',marginVertical:8}}>{error}</Text>}
      {!!notice && <Text style={{color:'#087F68',textAlign:'right',marginVertical:8}}>{notice}</Text>}
      {target ? <View style={s.chatCard}>
        <View style={s.row}><Pressable onPress={()=>{setTarget(null);setItems([]);setError('');}}><Text style={{color:C.green,fontWeight:'800'}}>إغلاق</Text></Pressable><View style={{flex:1}}><Text style={s.roomName}>{target.display_name || 'عضو Jehoo'}</Text><Text style={s.muted}>ID: {String(target.public_id || '').padStart(6,'0')}</Text></View></View>
        <View style={s.row}><Button active onPress={toggleFollow}>{following ? '✓ تتابعه' : '+ متابعة'}</Button><Button onPress={toggleBlock}>{blocked.includes(target.id) ? 'إلغاء الحظر' : '🚫 حظر'}</Button><Button onPress={deleteConversation}>حذف الدردشة</Button></View>
        <View style={{minHeight:120,maxHeight:360}}>
          <ScrollView>
            {items.map(m=><View key={m.id} style={[s.messageBubble,{alignSelf:m.sender_id===user.id?'flex-end':'flex-start',backgroundColor:m.sender_id===user.id?'#DDF8EF':C.white}]}>
              <Text style={{color:C.ink,textAlign:'right'}}>{m.body}</Text><View style={s.row}><Text style={s.muted}>{new Date(m.created_at).toLocaleString()}</Text><Pressable onPress={()=>copyMessage(m.body)}><Text style={{color:C.green,fontWeight:'700'}}>نسخ</Text></Pressable></View>
            </View>)}
            {!items.length && <Text style={s.muted}>ابدأ المحادثة برسالة خاصة 👋</Text>}
          </ScrollView>
        </View>
        {blocked.includes(target.id) ? <Text style={{color:'#B42318',textAlign:'right'}}>هذا المستخدم محظور؛ ألغِ الحظر لإرسال رسالة.</Text> :
          <View style={s.row}><TextInput value={text} onChangeText={setText} placeholder="اكتب رسالة خاصة..." multiline style={[s.input,{flex:1,marginVertical:0}]} /><Pressable onPress={sendMessage} disabled={busy} style={s.cta}><Text style={s.ctaText}>إرسال</Text></Pressable></View>}
      </View> : <><Text style={s.heading}>محادثاتك</Text>
        {inbox.map((item)=><Pressable key={item.profile.id} onPress={()=>openProfile(item.profile)} style={s.room}><View style={s.roomIcon}><Text style={{fontSize:26}}>💬</Text></View><View style={{flex:1}}><Text style={s.roomName}>{item.profile.display_name || 'عضو Jehoo'}</Text><Text style={s.muted}>ID: {String(item.profile.public_id || '').padStart(6,'0')}</Text><Text style={s.muted} numberOfLines={1}>{item.message.body}</Text></View></Pressable>)}
        {!inbox.length && <View style={s.empty}><Text style={{fontSize:38}}>💬</Text><Text style={s.heading}>لا توجد محادثات بعد</Text><Text style={s.muted}>ابحث عن المستخدم بواسطة ID من 6 أرقام لبدء محادثة.</Text></View>}
      </>}
    </ScrollView>
  </>;
}
export default function App() {
  const [tab, setTab] = useState('الرئيسية');
  const [room, setRoom] = useState(null);
  const [auth, setAuth] = useState(false);
  const [session, setSession] = useState(null);
  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => { if (mounted) setSession(data.session); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);
  return <SafeAreaView style={s.safe}><StatusBar barStyle="dark-content" backgroundColor={C.bg} />
    {auth ? <><Pressable onPress={() => setAuth(false)} style={{ padding: 16 }}><Text style={{ color: C.green }}>رجوع</Text></Pressable><AuthScreen onDone={(nextSession) => { setSession(nextSession); setAuth(false); setTab('أنا'); }} /></> : room ? <VoiceRoomScreen room={room} session={session} onBack={() => setRoom(null)} onSignIn={() => { setRoom(null); setAuth(true); }} /> : tab === 'الرئيسية' ? <Home openRoom={setRoom} /> : tab === 'الرسائل' ? <Messages session={session} /> : <ProfileScreen session={session} onSignIn={() => setAuth(true)} />}
    {!room && !auth && <View style={s.nav}>{[['الرئيسية','⌂'],['الرسائل','●'],['أنا','☺']].map(item => <Pressable key={item[0]} onPress={() => setTab(item[0])} style={s.navItem}><Text style={{ fontSize: 24, color: tab === item[0] ? C.green : '#A8B6B2' }}>{item[1]}</Text><Text style={{ fontSize: 11, color: tab === item[0] ? C.green : C.muted }}>{item[0]}</Text></Pressable>)}<Pressable onPress={() => setAuth(true)} style={s.navItem}><Text style={{ fontSize: 24 }}>↗</Text><Text style={s.muted}>دخول</Text></Pressable></View>}
  </SafeAreaView>;
}
const s = StyleSheet.create({
  safe:{flex:1,backgroundColor:C.bg}, header:{padding:18,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}, brand:{fontSize:22,fontWeight:'900',color:C.dark}, title:{fontSize:19,fontWeight:'900',color:C.ink}, muted:{fontSize:12,color:C.muted,marginTop:4,textAlign:'right'}, pad:{padding:16,paddingBottom:30}, hero:{backgroundColor:C.dark,borderRadius:24,padding:22,marginBottom:24}, heroSmall:{color:'#8BEBD5',textAlign:'right'}, heroTitle:{fontSize:25,fontWeight:'900',color:C.white,textAlign:'right',marginTop:8}, heroText:{color:'#C6E7DE',textAlign:'right',marginTop:8,lineHeight:22}, cta:{backgroundColor:C.green,padding:13,borderRadius:14,alignSelf:'flex-start',marginTop:15}, ctaText:{fontWeight:'900',color:C.dark}, row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:14}, heading:{fontSize:17,fontWeight:'900',color:C.ink,textAlign:'right',marginVertical:8}, pill:{backgroundColor:'#E6EFEB',paddingHorizontal:12,paddingVertical:9,borderRadius:25}, room:{backgroundColor:C.white,borderRadius:18,padding:12,marginBottom:10,flexDirection:'row',alignItems:'center',gap:12}, roomIcon:{width:58,height:58,borderRadius:16,alignItems:'center',justifyContent:'center'}, roomName:{fontWeight:'900',fontSize:14,color:C.ink,textAlign:'right'}, roomMeta:{color:'#079C7B',fontSize:12,marginTop:6}, chev:{fontSize:26,color:'#9BAAA5'}, gift:{flex:1,alignItems:'center',backgroundColor:C.white,borderRadius:16,paddingVertical:13}, roomHeader:{backgroundColor:C.dark,padding:20,alignItems:'flex-end'}, roomBanner:{backgroundColor:'#DFF8F0',borderRadius:20,padding:20,alignItems:'center',marginBottom:20}, seats:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',marginVertical:15}, seat:{width:'19%',alignItems:'center',marginBottom:15}, seatCircle:{width:48,height:48,borderRadius:25,backgroundColor:C.dark,borderWidth:2,borderColor:C.green,alignItems:'center',justifyContent:'center',marginBottom:5}, bubble:{backgroundColor:C.white,padding:14,borderRadius:15,marginVertical:12}, input:{backgroundColor:C.white,borderWidth:1,borderColor:'#DDE7E3',borderRadius:14,padding:13,textAlign:'right',marginVertical:8}, nav:{height:65,backgroundColor:C.white,borderTopWidth:1,borderTopColor:'#E5ECE9',flexDirection:'row',justifyContent:'space-around',alignItems:'center'}, navItem:{alignItems:'center'}, profile:{backgroundColor:'#DDF8EF',borderRadius:22,alignItems:'center',padding:24,gap:8}, stat:{alignItems:'center',backgroundColor:C.white,padding:15,borderRadius:15,flex:1}, menu:{backgroundColor:C.white,padding:18,borderRadius:14,marginBottom:8,flexDirection:'row',justifyContent:'space-between',alignItems:'center'}, empty:{flex:1,alignItems:'center',justifyContent:'center',gap:12,padding:24}, chatCard:{backgroundColor:'#EAF3EF',borderRadius:18,padding:12,marginTop:12,marginBottom:18,gap:8}, messageBubble:{maxWidth:'88%',padding:10,borderRadius:14,marginVertical:5}, auth:{flex:1,justifyContent:'center',padding:24,gap:14,alignItems:'stretch'}
});
