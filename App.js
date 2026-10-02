import React, { useState } from 'react';
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
function Profile() {
  return <><Header title="ملفي الشخصي" subtitle="حسابك على Jehoo" /><ScrollView contentContainerStyle={s.pad}>
    <View style={s.profile}><Text style={{ fontSize: 52 }}>🙂</Text><Text style={s.heroTitle}>عضو Jehoo</Text><Text style={s.muted}>عضو جديد · 🌍 غير محدد</Text><Button active>تعديل الملف الشخصي</Button></View>
    <View style={s.row}>{[['0','أصدقاء'],['0','متابعون'],['1','المستوى']].map(item => <View key={item[1]} style={s.stat}><Text style={s.heading}>{item[0]}</Text><Text style={s.muted}>{item[1]}</Text></View>)}</View>
    {['🎁 الهدايا والمقتنيات','🪙 المحفظة والعملات','👑 عضوية VIP','🏢 الوكالات','⚙️ الإعدادات والخصوصية','🛡️ الأمان والإبلاغ'].map(item => <View key={item} style={s.menu}><Text style={s.roomName}>{item}</Text><Text style={s.chev}>‹</Text></View>)}
  </ScrollView></>;
}
function Messages() {
  return <><Header title="الرسائل" subtitle="ابقَ على تواصل" /><View style={s.empty}><Text style={{ fontSize: 42 }}>💬</Text><Text style={s.heading}>محادثاتك ستظهر هنا</Text><Text style={s.muted}>تحتاج الرسائل الحقيقية إلى حساب وخادم آمن.</Text></View></>;
}
function Auth() {
  const [mode, setMode] = useState('تسجيل الدخول');
  return <View style={s.auth}><Text style={s.brand}>Jehoo</Text><Text style={s.heading}>مرحباً بك في مجتمعك</Text><View style={s.row}><Button active={mode === 'تسجيل الدخول'} onPress={() => setMode('تسجيل الدخول')}>دخول</Button><Button active={mode === 'إنشاء حساب'} onPress={() => setMode('إنشاء حساب')}>إنشاء حساب</Button></View>{mode === 'إنشاء حساب' && <TextInput placeholder="الاسم المستعار" style={s.input} />}<TextInput placeholder="البريد الإلكتروني أو الهاتف" style={s.input} /><TextInput placeholder="كلمة المرور" secureTextEntry style={s.input} /><Pressable style={s.cta}><Text style={s.ctaText}>{mode}</Text></Pressable><Text style={s.muted}>واجهة تجريبية فقط؛ المصادقة غير مفعلة.</Text></View>;
}
export default function App() {
  const [tab, setTab] = useState('الرئيسية');
  const [room, setRoom] = useState(null);
  const [auth, setAuth] = useState(false);
  return <SafeAreaView style={s.safe}><StatusBar barStyle="dark-content" backgroundColor={C.bg} />
    {auth ? <><Pressable onPress={() => setAuth(false)} style={{ padding: 16 }}><Text style={{ color: C.green }}>رجوع</Text></Pressable><Auth /></> : room ? <Room room={room} back={() => setRoom(null)} /> : tab === 'الرئيسية' ? <Home openRoom={setRoom} /> : tab === 'الرسائل' ? <Messages /> : <Profile />}
    {!room && !auth && <View style={s.nav}>{[['الرئيسية','⌂'],['الرسائل','●'],['أنا','☺']].map(item => <Pressable key={item[0]} onPress={() => setTab(item[0])} style={s.navItem}><Text style={{ fontSize: 24, color: tab === item[0] ? C.green : '#A8B6B2' }}>{item[1]}</Text><Text style={{ fontSize: 11, color: tab === item[0] ? C.green : C.muted }}>{item[0]}</Text></Pressable>)}<Pressable onPress={() => setAuth(true)} style={s.navItem}><Text style={{ fontSize: 24 }}>↗</Text><Text style={s.muted}>دخول</Text></Pressable></View>}
  </SafeAreaView>;
}
const s = StyleSheet.create({
  safe:{flex:1,backgroundColor:C.bg}, header:{padding:18,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}, brand:{fontSize:22,fontWeight:'900',color:C.dark}, title:{fontSize:19,fontWeight:'900',color:C.ink}, muted:{fontSize:12,color:C.muted,marginTop:4,textAlign:'right'}, pad:{padding:16,paddingBottom:30}, hero:{backgroundColor:C.dark,borderRadius:24,padding:22,marginBottom:24}, heroSmall:{color:'#8BEBD5',textAlign:'right'}, heroTitle:{fontSize:25,fontWeight:'900',color:C.white,textAlign:'right',marginTop:8}, heroText:{color:'#C6E7DE',textAlign:'right',marginTop:8,lineHeight:22}, cta:{backgroundColor:C.green,padding:13,borderRadius:14,alignSelf:'flex-start',marginTop:15}, ctaText:{fontWeight:'900',color:C.dark}, row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:14}, heading:{fontSize:17,fontWeight:'900',color:C.ink,textAlign:'right',marginVertical:8}, pill:{backgroundColor:'#E6EFEB',paddingHorizontal:12,paddingVertical:9,borderRadius:25}, room:{backgroundColor:C.white,borderRadius:18,padding:12,marginBottom:10,flexDirection:'row',alignItems:'center',gap:12}, roomIcon:{width:58,height:58,borderRadius:16,alignItems:'center',justifyContent:'center'}, roomName:{fontWeight:'900',fontSize:14,color:C.ink,textAlign:'right'}, roomMeta:{color:'#079C7B',fontSize:12,marginTop:6}, chev:{fontSize:26,color:'#9BAAA5'}, gift:{flex:1,alignItems:'center',backgroundColor:C.white,borderRadius:16,paddingVertical:13}, roomHeader:{backgroundColor:C.dark,padding:20,alignItems:'flex-end'}, roomBanner:{backgroundColor:'#DFF8F0',borderRadius:20,padding:20,alignItems:'center',marginBottom:20}, seats:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',marginVertical:15}, seat:{width:'19%',alignItems:'center',marginBottom:15}, seatCircle:{width:48,height:48,borderRadius:25,backgroundColor:C.dark,borderWidth:2,borderColor:C.green,alignItems:'center',justifyContent:'center',marginBottom:5}, bubble:{backgroundColor:C.white,padding:14,borderRadius:15,marginVertical:12}, input:{backgroundColor:C.white,borderWidth:1,borderColor:'#DDE7E3',borderRadius:14,padding:13,textAlign:'right',marginVertical:8}, nav:{height:65,backgroundColor:C.white,borderTopWidth:1,borderTopColor:'#E5ECE9',flexDirection:'row',justifyContent:'space-around',alignItems:'center'}, navItem:{alignItems:'center'}, profile:{backgroundColor:'#DDF8EF',borderRadius:22,alignItems:'center',padding:24,gap:8}, stat:{alignItems:'center',backgroundColor:C.white,padding:15,borderRadius:15,flex:1}, menu:{backgroundColor:C.white,padding:18,borderRadius:14,marginBottom:8,flexDirection:'row',justifyContent:'space-between',alignItems:'center'}, empty:{flex:1,alignItems:'center',justifyContent:'center',gap:12,padding:24}, auth:{flex:1,justifyContent:'center',padding:24,gap:14,alignItems:'stretch'}
});
