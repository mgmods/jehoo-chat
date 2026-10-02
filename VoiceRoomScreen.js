import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { LiveKitRoom, AudioSession, registerGlobals, useRoomContext } from '@livekit/react-native';
import { RoomEvent } from 'livekit-client';

registerGlobals();

const palette = { green: '#18C9A5', dark: '#07372F', bg: '#F3F7F5', ink: '#19312C', muted: '#82918D', white: '#FFFFFF' };

/**
 * Expects a trusted backend POST endpoint returning:
 * { serverUrl: "wss://...", participantToken: "..." }
 * The backend must authenticate the user and issue a short-lived LiveKit token.
 * Never place LiveKit API secrets in the mobile app.
 */
export default function VoiceRoomScreen({ room, onBack }) {
  const [endpoint, setEndpoint] = useState(process.env.EXPO_PUBLIC_VOICE_TOKEN_URL || '');
  const [live, setLive] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function connect() {
    setError('');
    if (!endpoint.trim()) {
      setError('أضف رابط خدمة إصدار رمز الصوت في إعدادات البيئة أولاً.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(endpoint.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName: room.name, identity: 'jehoo-mobile-user' }),
      });
      if (!response.ok) throw new Error('تعذر الحصول على رمز الغرفة من الخادم.');
      const data = await response.json();
      if (!data.serverUrl || !data.participantToken) throw new Error('استجابة الخادم يجب أن تتضمن serverUrl و participantToken.');
      await AudioSession.startAudioSession();
      setLive({ url: data.serverUrl, token: data.participantToken });
    } catch (e) {
      setError(e?.message || 'فشل الاتصال. تحقق من الخادم والإنترنت.');
    } finally {
      setBusy(false);
    }
  }

  return <View style={styles.page}>
    <View style={styles.top}><Pressable onPress={onBack}><Text style={styles.back}>رجوع ‹</Text></Pressable><Text style={styles.title}>{room.name}</Text><Text style={styles.sub}>غرفة صوتية · Jehoo</Text></View>
    <ScrollView contentContainerStyle={styles.body}>
      <View style={styles.stage}><Text style={{ fontSize: 48 }}>🎙️</Text><Text style={styles.heading}>{live ? 'جارٍ الانضمام إلى الغرفة' : 'اجتمعوا بالصوت'}</Text><Text style={styles.muted}>غرف صوتية بتصميم قابل للتوسّع</Text>
        {live ? <LiveKitRoom serverUrl={live.url} token={live.token} connect={true} audio={true} video={false} onDisconnected={() => { setLive(null); AudioSession.stopAudioSession().catch(() => {}); }}>
          <ConnectedRoom onLeave={() => { setLive(null); AudioSession.stopAudioSession().catch(() => {}); }} />
        </LiveKitRoom> : <Pressable disabled={busy} style={styles.cta} onPress={connect}>{busy ? <ActivityIndicator color={palette.dark} /> : <Text style={styles.ctaText}>اتصال بالغرفة الصوتية</Text>}</Pressable>}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.heading}>المقاعد الصوتية</Text><View style={styles.seats}>{['👑','🎙️','🎙️','🎙️','🎙️','🎙️','🎙️','🎙️','🎙️','🎙️'].map((v,i)=><View key={i} style={styles.seat}><View style={styles.circle}><Text style={{fontSize:22}}>{v}</Text></View><Text style={styles.muted}>{i===0?'المضيف':'مقعد '+i}</Text></View>)}</View>
      <View style={styles.notice}><Text style={styles.noticeText}>تحتاج الغرف الفعلية إلى خادم يصدر رموز LiveKit قصيرة العمر. المقاعد المعروضة هنا تصميم أولي وليست قائمة المشاركين الحقيقية.</Text></View>
    </ScrollView>
  </View>;
}

function ConnectedRoom({ onLeave }) {
  const room = useRoomContext();
  const [participants, setParticipants] = useState(room?.remoteParticipants?.size || 0);
  const [micOn, setMicOn] = useState(true);
  React.useEffect(() => {
    const update = () => setParticipants(room?.remoteParticipants?.size || 0);
    room?.on(RoomEvent.ParticipantConnected, update);
    room?.on(RoomEvent.ParticipantDisconnected, update);
    return () => {
      room?.off(RoomEvent.ParticipantConnected, update);
      room?.off(RoomEvent.ParticipantDisconnected, update);
    };
  }, [room]);
  async function toggleMic() {
    try { await room.localParticipant.setMicrophoneEnabled(!micOn); setMicOn(!micOn); }
    catch { /* Connection errors are surfaced by LiveKit; user can retry by leaving and reconnecting. */ }
  }
  return <View style={styles.controls}>
    <Text style={styles.connected}>● متصل · {participants} مشاركاً آخر</Text>
    <View style={styles.actions}><Pressable style={styles.cta} onPress={toggleMic}><Text style={styles.ctaText}>{micOn ? '🔇 كتم الميكروفون' : '🎙️ تشغيل الميكروفون'}</Text></Pressable><Pressable style={styles.leave} onPress={onLeave}><Text style={{color:'#FFFFFF',fontWeight:'800'}}>مغادرة</Text></Pressable></View>
  </View>;
}

const styles = StyleSheet.create({
 page:{flex:1,backgroundColor:palette.bg},top:{backgroundColor:palette.dark,padding:20,alignItems:'flex-end'},back:{color:'#8BEBD5',fontWeight:'700'},title:{color:palette.white,fontSize:23,fontWeight:'900',marginTop:12},sub:{color:'#C6E7DE',marginTop:5},body:{padding:16,paddingBottom:35},stage:{backgroundColor:palette.white,borderRadius:24,padding:22,alignItems:'center',marginBottom:20},heading:{fontSize:18,fontWeight:'900',color:palette.ink,textAlign:'right',marginTop:12,marginBottom:10},muted:{fontSize:12,color:palette.muted,textAlign:'center',marginTop:5},cta:{backgroundColor:palette.green,borderRadius:14,padding:14,marginTop:18,alignItems:'center'},ctaText:{color:palette.dark,fontWeight:'900'},error:{color:'#B42318',backgroundColor:'#FEE4E2',padding:12,borderRadius:12,marginBottom:14,textAlign:'right'},seats:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',marginTop:14},seat:{width:'19%',alignItems:'center',marginBottom:16},circle:{width:48,height:48,borderRadius:25,backgroundColor:palette.dark,borderWidth:2,borderColor:palette.green,alignItems:'center',justifyContent:'center',marginBottom:5},notice:{backgroundColor:'#E4F7F0',padding:14,borderRadius:14,marginTop:8},noticeText:{color:palette.ink,textAlign:'right',lineHeight:22},controls:{width:'100%',marginTop:10},connected:{color:'#087F5B',fontWeight:'800',textAlign:'center'},actions:{flexDirection:'row',gap:10,justifyContent:'center',flexWrap:'wrap'},leave:{backgroundColor:'#B42318',borderRadius:14,padding:14,marginTop:18,alignItems:'center'}
});
