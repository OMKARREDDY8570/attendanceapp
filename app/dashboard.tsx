import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, RefreshControl, TouchableOpacity,
  TextInput, StyleSheet, Dimensions, Modal, Pressable,
  Platform, ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming,
  FadeInDown, FadeInUp,
} from 'react-native-reanimated';
import Svg, { Circle, G } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { clearCredentials, saveChatId, clearChatId } from '../lib/storage';
import {
  fetchAttendance, telegramSubscribe, telegramUnsubscribe,
  sendNow, AttendanceData, Subject,
} from '../lib/api';
import { COLORS, FONTS } from '../lib/theme';

const { width } = Dimensions.get('window');
const HALF = (width - 48 - 12) / 2;

/* ─── helpers ─────────────────────────────────────────────── */
function statusColor(pct: number) {
  return pct >= 75 ? COLORS.safe : pct >= 60 ? COLORS.warning : COLORS.danger;
}
function statusLabel(pct: number) {
  return pct >= 75 ? '✓ Safe' : pct >= 60 ? '⚠ Warning' : '✗ At Risk';
}

/* ─── Donut Chart ─────────────────────────────────────────── */
function DonutChart({ pct }: { pct: number }) {
  const R  = 78;
  const SW = 15;
  const C  = 2 * Math.PI * R;
  const offset = C - (pct / 100) * C;
  const col = statusColor(pct);

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={200} height={200}>
        <G rotation="-90" origin="100,100">
          <Circle cx={100} cy={100} r={R} stroke={COLORS.bgElevated} strokeWidth={SW} fill="none" />
          <Circle cx={100} cy={100} r={R} stroke={col} strokeWidth={SW} fill="none"
            strokeDasharray={`${C} ${C}`} strokeDashoffset={offset} strokeLinecap="round" />
        </G>
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <Text style={[ds.donutPct, { color: col }]}>{pct.toFixed(1)}%</Text>
        <View style={[ds.pill, { backgroundColor: col + '22', borderColor: col + '44' }]}>
          <Text style={[ds.pillTxt, { color: col }]}>{statusLabel(pct)}</Text>
        </View>
      </View>
    </View>
  );
}

/* ─── Metric Card ─────────────────────────────────────────── */
function MetricCard({ title, value, sub, color, icon }: {
  title: string; value: number; sub: string; color: string; icon: string;
}) {
  return (
    <View style={[ds.metricCard, { width: HALF }]}>
      <View style={[ds.metricIcon, { backgroundColor: color + '20' }]}>
        <Text style={{ fontSize: 20 }}>{icon}</Text>
      </View>
      <Text style={[ds.metricValue, { color }]}>{value}</Text>
      <Text style={ds.metricTitle}>{title}</Text>
      <Text style={ds.metricSub}>{sub}</Text>
    </View>
  );
}

/* ─── Subject Item ────────────────────────────────────────── */
function SubjectItem({ s, idx }: { s: Subject; idx: number }) {
  const progress = useSharedValue(0);
  const barStyle = useAnimatedStyle(() => ({
    width: `${progress.value * Math.min(s.percentage, 100)}%` as any,
  }));

  useEffect(() => {
    progress.value = withTiming(1, { duration: 750 + idx * 40 });
  }, []);

  const col = statusColor(s.percentage);

  return (
    <Animated.View entering={FadeInDown.delay(idx * 50).springify()} style={ds.subCard}>
      <View style={ds.subTop}>
        <Text style={ds.subName} numberOfLines={1}>{s.name}</Text>
        <Text style={[ds.subPct, { color: col }]}>{s.percentage.toFixed(1)}%</Text>
      </View>
      <View style={ds.subMeta}>
        <Text style={ds.subMetaTxt}>{s.attended}/{s.total} classes</Text>
        {s.canSkip > 0
          ? <Text style={[ds.badge, { color: COLORS.safe,   backgroundColor: COLORS.safe   + '18' }]}>Can skip {s.canSkip}</Text>
          : s.required > 0
          ? <Text style={[ds.badge, { color: COLORS.danger, backgroundColor: COLORS.danger + '18' }]}>Need {s.required} more</Text>
          : null}
      </View>
      <View style={ds.progBg}>
        <Animated.View style={[ds.progFill, { backgroundColor: col }, barStyle]} />
        <View style={ds.thresh} />
      </View>
    </Animated.View>
  );
}

/* ─── Bar Chart ───────────────────────────────────────────── */
function BarChart({ subjects }: { subjects: Subject[] }) {
  const items = subjects.slice(0, 8);
  return (
    <View style={ds.sectionCard}>
      <Text style={ds.sectionTitle}>Subject Overview</Text>
      <View style={ds.barRow}>
        {items.map((s, i) => {
          const barH = (s.percentage / 100) * 110;
          const col  = statusColor(s.percentage);
          return (
            <View key={i} style={ds.barWrap}>
              <Text style={ds.barPct}>{Math.round(s.percentage)}%</Text>
              <View style={ds.barBg}>
                <View style={[ds.barFill, { height: barH, backgroundColor: col }]} />
                <View style={ds.bar75} />
              </View>
              <Text style={ds.barLbl} numberOfLines={1}>{s.name.split(' ')[0]}</Text>
            </View>
          );
        })}
      </View>
      <View style={ds.barLegend}>
        <View style={{ width: 22, height: 2, backgroundColor: COLORS.warning }} />
        <Text style={ds.barLegendTxt}>75% threshold</Text>
      </View>
    </View>
  );
}

/* ─── Skip Predictor ──────────────────────────────────────── */
function SkipPredictor({ overall }: { overall: AttendanceData['overall'] }) {
  const [delta, setDelta] = useState(0); // + = skips, - = extra attend

  function adjust(d: number) {
    setDelta(v => Math.max(-20, Math.min(20, v + d)));
    Haptics.selectionAsync();
  }

  const futureAttended = overall.attended + (delta < 0 ? Math.abs(delta) : 0);
  const futureTotal    = overall.total    + Math.abs(delta);
  const futurePct      = futureTotal > 0 ? (futureAttended / futureTotal) * 100 : 0;
  const col            = statusColor(futurePct);

  return (
    <View style={ds.sectionCard}>
      <Text style={ds.sectionTitle}>Skip Predictor</Text>
      <Text style={ds.predictorSub}>Simulate skipping or attending extra classes</Text>

      <View style={ds.stepperRow}>
        <TouchableOpacity onPress={() => adjust(-1)} style={ds.stepBtn} activeOpacity={0.7}>
          <Text style={ds.stepBtnTxt}>−</Text>
        </TouchableOpacity>
        <View style={ds.stepVal}>
          <Text style={ds.stepNum}>{Math.abs(delta)}</Text>
          <Text style={ds.stepLbl}>{delta >= 0 ? 'classes to skip' : 'extra to attend'}</Text>
        </View>
        <TouchableOpacity onPress={() => adjust(1)} style={ds.stepBtn} activeOpacity={0.7}>
          <Text style={ds.stepBtnTxt}>+</Text>
        </TouchableOpacity>
      </View>

      <View style={ds.tileGrid}>
        {[
          { label: 'Future %',  val: futurePct.toFixed(1) + '%', color: col },
          { label: 'Status',    val: statusLabel(futurePct),       color: col },
          { label: 'Attended',  val: String(futureAttended),        color: COLORS.text },
          { label: 'Total',     val: String(futureTotal),           color: COLORS.text },
        ].map(t => (
          <View key={t.label} style={ds.tile}>
            <Text style={ds.tileLbl}>{t.label}</Text>
            <Text style={[ds.tileVal, { color: t.color }]}>{t.val}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/* ─── Telegram Sheet ──────────────────────────────────────── */
function TelegramSheet({
  visible, onClose, roll, password, subscribed, onToggle,
}: {
  visible: boolean; onClose: () => void;
  roll: string; password: string;
  subscribed: boolean; onToggle: (v: boolean) => void;
}) {
  const [chatId,  setChatId]  = useState('');
  const [loading, setLoading] = useState(false);
  const [msg,     setMsg]     = useState('');

  async function handleSubscribe() {
    if (!chatId.trim()) { setMsg('Please enter your Chat ID.'); return; }
    setLoading(true); setMsg('');
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const res = await telegramSubscribe(roll, password, chatId.trim());
      if (res.status === 'success') {
        await saveChatId(chatId.trim());
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onToggle(true);
        setMsg('✓ Subscribed! You will receive daily alerts.');
      } else {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setMsg(res.message || 'Failed to subscribe.');
      }
    } catch { setMsg('Network error. Try again.'); }
    finally { setLoading(false); }
  }

  async function handleUnsubscribe() {
    setLoading(true); setMsg('');
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const res = await telegramUnsubscribe(roll);
      if (res.status === 'success') {
        await clearChatId();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onToggle(false);
        setMsg('Unsubscribed from daily alerts.');
      }
    } catch { setMsg('Network error.'); }
    finally { setLoading(false); }
  }

  async function handleSendNow() {
    setLoading(true); setMsg('');
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const res = await sendNow(roll, password);
      setMsg(res.status === 'success' ? '✓ Report sent to Telegram!' : (res.message || 'Failed.'));
    } catch { setMsg('Network error.'); }
    finally { setLoading(false); }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={ds.overlay} onPress={onClose} />
      <View style={ds.sheet}>
        <View style={ds.sheetHandle} />

        <View style={ds.sheetHead}>
          <Text style={ds.sheetTitle}>📬  Telegram Alerts</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={22} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        {!!msg && (
          <View style={ds.sheetMsg}>
            <Text style={ds.sheetMsgTxt}>{msg}</Text>
          </View>
        )}

        {!subscribed ? (
          <>
            <View style={ds.guideBox}>
              <Text style={ds.guideTitleTxt}>How to get your Chat ID:</Text>
              {[
                '1. Open Telegram → search @userinfobot',
                '2. Send /start to the bot',
                '3. Copy the numeric ID it sends back',
              ].map(step => (
                <Text key={step} style={ds.guideStep}>{step}</Text>
              ))}
            </View>
            <View style={ds.sheetInputRow}>
              <Ionicons name="chatbubble-outline" size={16} color={COLORS.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                style={ds.sheetInput} placeholder="Your Telegram Chat ID"
                placeholderTextColor={COLORS.textMuted}
                value={chatId} onChangeText={setChatId} keyboardType="numeric"
              />
            </View>
            <TouchableOpacity onPress={handleSubscribe} disabled={loading} activeOpacity={0.85}>
              <LinearGradient colors={[COLORS.primary, '#8B5CF6']} style={ds.sheetPrimaryBtn}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={ds.sheetPrimaryBtnTxt}>Enable Alerts</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </>
        ) : (
          <View style={{ gap: 12 }}>
            <TouchableOpacity onPress={handleSendNow} disabled={loading}
              style={[ds.sheetOutlineBtn, { borderColor: COLORS.primary }]}>
              <Ionicons name="send-outline" size={18} color={COLORS.primary} />
              <Text style={[ds.sheetOutlineTxt, { color: COLORS.primary }]}>Send Report Now</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleUnsubscribe} disabled={loading}
              style={[ds.sheetOutlineBtn, { borderColor: COLORS.danger }]}>
              <Ionicons name="notifications-off-outline" size={18} color={COLORS.danger} />
              <Text style={[ds.sheetOutlineTxt, { color: COLORS.danger }]}>Disable Alerts</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

/* ─── Dashboard Screen ────────────────────────────────────── */
export default function DashboardScreen() {
  const params = useLocalSearchParams<{ roll: string; password: string }>();
  const { roll, password } = params;

  const [data,        setData]        = useState<AttendanceData | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [search,      setSearch]      = useState('');
  const [filter,      setFilter]      = useState<'all' | 'safe' | 'risk'>('all');
  const [sort,        setSort]        = useState<'default' | 'high' | 'low'>('default');
  const [tgOpen,      setTgOpen]      = useState(false);
  const [tgSubbed,    setTgSubbed]    = useState(false);

  useEffect(() => { load(); }, []);

  async function load(isRefresh = false) {
    if (!isRefresh) setLoading(true);
    try {
      const res = await fetchAttendance(roll, password);
      if (res.status === 'success' && res.data) {
        setData(res.data);
        setTgSubbed(res.data.telegram?.subscribed ?? false);
      }
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, []);

  async function handleLogout() {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await clearCredentials();
    router.replace('/');
  }

  /* Loading state */
  if (loading) {
    return (
      <View style={[ds.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={{ color: COLORS.textMuted, fontFamily: FONTS.body, marginTop: 12 }}>
          Fetching your attendance…
        </Text>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[ds.container, { justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
        <Text style={{ color: COLORS.danger, fontFamily: FONTS.bodySemiBold, fontSize: 16, textAlign: 'center' }}>
          Could not load attendance data.{'\n'}Pull down to retry.
        </Text>
        <TouchableOpacity onPress={() => load()} style={{ marginTop: 20, padding: 12, backgroundColor: COLORS.primary, borderRadius: 12 }}>
          <Text style={{ color: '#fff', fontFamily: FONTS.bodySemiBold }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { overall, subjects } = data;
  const canSkip  = overall.canSkip  ?? subjects.reduce((s, x) => s + (x.canSkip  || 0), 0);
  const required = overall.required ?? subjects.reduce((s, x) => s + (x.required || 0), 0);

  /* Filter + sort */
  let filtered = subjects.filter(s => {
    const q = s.name.toLowerCase().includes(search.toLowerCase());
    const f = filter === 'all' ? true : filter === 'safe' ? s.percentage >= 75 : s.percentage < 75;
    return q && f;
  });
  if (sort === 'high') filtered = [...filtered].sort((a, b) => b.percentage - a.percentage);
  if (sort === 'low')  filtered = [...filtered].sort((a, b) => a.percentage - b.percentage);

  const initials = roll.substring(0, 2).toUpperCase();

  return (
    <View style={ds.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
        contentContainerStyle={{ paddingBottom: 48 }}
      >
        {/* ── Header ── */}
        <LinearGradient colors={[COLORS.bgCard, COLORS.bg]} style={ds.header}>
          <View style={ds.headerL}>
            <LinearGradient colors={[COLORS.primary, '#8B5CF6']} style={ds.avatar}>
              <Text style={ds.avatarTxt}>{initials}</Text>
            </LinearGradient>
            <View>
              <Text style={ds.greet}>Good day,</Text>
              <Text style={ds.rollTxt}>{roll}</Text>
            </View>
          </View>
          <View style={ds.headerR}>
            <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setTgOpen(true); }} style={ds.iconBtn}>
              <Ionicons name={tgSubbed ? 'notifications' : 'notifications-outline'} size={22}
                color={tgSubbed ? COLORS.primary : COLORS.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLogout} style={ds.iconBtn}>
              <Ionicons name="log-out-outline" size={22} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>
        </LinearGradient>

        <View style={ds.body}>
          {/* ── Donut ── */}
          <Animated.View entering={FadeInDown.delay(80).springify()} style={ds.sectionCard}>
            <Text style={ds.sectionTitle}>Overall Attendance</Text>
            <DonutChart pct={overall.percentage} />
            <Text style={ds.donutSub}>{overall.attended} attended of {overall.total} total classes</Text>
          </Animated.View>

          {/* ── Metrics ── */}
          <Animated.View entering={FadeInDown.delay(130).springify()} style={ds.metricRow}>
            <MetricCard title="Can Skip" value={canSkip}  sub="classes safely"   color={COLORS.safe}   icon="✅" />
            <MetricCard title="Need More" value={required} sub="to reach 75%"    color={COLORS.danger}  icon="📌" />
          </Animated.View>

          {/* ── Bar Chart ── */}
          <Animated.View entering={FadeInDown.delay(180).springify()}>
            <BarChart subjects={subjects} />
          </Animated.View>

          {/* ── Skip Predictor ── */}
          <Animated.View entering={FadeInDown.delay(230).springify()}>
            <SkipPredictor overall={overall} />
          </Animated.View>

          {/* ── Subject List ── */}
          <Animated.View entering={FadeInDown.delay(280).springify()} style={ds.sectionCard}>
            <Text style={ds.sectionTitle}>Subjects</Text>

            {/* Search */}
            <View style={ds.searchBar}>
              <Ionicons name="search-outline" size={16} color={COLORS.textMuted} />
              <TextInput
                style={ds.searchInput} placeholder="Search subjects…"
                placeholderTextColor={COLORS.textMuted}
                value={search} onChangeText={setSearch}
              />
            </View>

            {/* Chips + Sort */}
            <View style={ds.chipRow}>
              {(['all', 'safe', 'risk'] as const).map(f => (
                <TouchableOpacity key={f} activeOpacity={0.75}
                  onPress={() => { setFilter(f); Haptics.selectionAsync(); }}
                  style={[ds.chip, filter === f && ds.chipOn]}>
                  <Text style={[ds.chipTxt, filter === f && ds.chipTxtOn]}>
                    {f === 'all' ? 'All' : f === 'safe' ? '✓ Safe' : '⚠ At Risk'}
                  </Text>
                </TouchableOpacity>
              ))}
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={() => { setSort(s => s === 'default' ? 'high' : s === 'high' ? 'low' : 'default'); Haptics.selectionAsync(); }} style={ds.sortBtn}>
                <Ionicons name="funnel-outline" size={13} color={COLORS.textMuted} />
                <Text style={ds.sortTxt}>{sort === 'default' ? 'Default' : sort === 'high' ? 'Highest' : 'Lowest'}</Text>
              </TouchableOpacity>
            </View>

            {filtered.map((s, i) => <SubjectItem key={s.name} s={s} idx={i} />)}
            {filtered.length === 0 && (
              <Text style={{ color: COLORS.textMuted, fontFamily: FONTS.body, textAlign: 'center', paddingVertical: 20 }}>
                No subjects match your filter.
              </Text>
            )}
          </Animated.View>
        </View>
      </ScrollView>

      <TelegramSheet
        visible={tgOpen} onClose={() => setTgOpen(false)}
        roll={roll} password={password}
        subscribed={tgSubbed} onToggle={setTgSubbed}
      />
    </View>
  );
}

/* ─── Styles ──────────────────────────────────────────────── */
const ds = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 58 : 46, paddingBottom: 20 },
  headerL: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerR: { flexDirection: 'row', gap: 8 },
  avatar:  { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  avatarTxt: { fontFamily: FONTS.heading, fontSize: 16, color: '#fff' },
  greet:   { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textMuted },
  rollTxt: { fontFamily: FONTS.headingMedium, fontSize: 16, color: COLORS.text },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.bgCard, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },

  body: { paddingHorizontal: 16, gap: 12 },

  sectionCard: { backgroundColor: COLORS.bgCard, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: COLORS.border },
  sectionTitle: { fontFamily: FONTS.headingMedium, fontSize: 17, color: COLORS.text, marginBottom: 14 },

  donutPct: { fontFamily: FONTS.heading, fontSize: 38 },
  donutSub: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textMuted, marginTop: 6, textAlign: 'center' },
  pill:     { borderRadius: 100, paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1, marginTop: 2 },
  pillTxt:  { fontFamily: FONTS.bodySemiBold, fontSize: 12 },

  metricRow: { flexDirection: 'row', gap: 12 },
  metricCard: { backgroundColor: COLORS.bgCard, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: COLORS.border, gap: 6 },
  metricIcon: { width: 42, height: 42, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  metricValue: { fontFamily: FONTS.heading, fontSize: 30 },
  metricTitle: { fontFamily: FONTS.bodySemiBold, fontSize: 13, color: COLORS.text },
  metricSub:   { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textMuted },

  barRow: { flexDirection: 'row', alignItems: 'flex-end', height: 150, gap: 6, paddingBottom: 2 },
  barWrap: { flex: 1, alignItems: 'center', gap: 4 },
  barPct:  { fontFamily: FONTS.body, fontSize: 8, color: COLORS.textMuted },
  barBg:   { width: '100%', height: 110, backgroundColor: COLORS.bgElevated, borderRadius: 5, justifyContent: 'flex-end', overflow: 'hidden', position: 'relative' },
  barFill: { width: '100%', borderRadius: 4 },
  bar75:   { position: 'absolute', left: 0, right: 0, top: '25%', height: 1.5, backgroundColor: COLORS.warning + 'BB' },
  barLbl:  { fontFamily: FONTS.body, fontSize: 8, color: COLORS.textMuted, textAlign: 'center', width: '100%' },
  barLegend: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  barLegendTxt: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textMuted },

  predictorSub: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textMuted, marginBottom: 18, marginTop: -6 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, marginBottom: 20 },
  stepBtn:  { width: 46, height: 46, borderRadius: 23, backgroundColor: COLORS.bgElevated, borderWidth: 1, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center' },
  stepBtnTxt: { fontFamily: FONTS.heading, fontSize: 24, color: COLORS.text },
  stepVal:  { alignItems: 'center', minWidth: 90 },
  stepNum:  { fontFamily: FONTS.heading, fontSize: 40, color: COLORS.text },
  stepLbl:  { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textMuted },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile:     { flex: 1, minWidth: '44%', backgroundColor: COLORS.bgElevated, borderRadius: 13, padding: 13, borderWidth: 1, borderColor: COLORS.border },
  tileLbl:  { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textMuted, marginBottom: 4 },
  tileVal:  { fontFamily: FONTS.heading, fontSize: 22, color: COLORS.text },

  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.bgElevated, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 13, paddingVertical: 10, marginBottom: 12 },
  searchInput: { flex: 1, fontFamily: FONTS.body, fontSize: 14, color: COLORS.text },

  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' },
  chip:    { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bgElevated },
  chipOn:  { backgroundColor: COLORS.primary + '22', borderColor: COLORS.primary },
  chipTxt: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textMuted },
  chipTxtOn: { color: COLORS.primaryLight, fontFamily: FONTS.bodySemiBold },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 100, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bgElevated },
  sortTxt: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textMuted },

  subCard: { backgroundColor: COLORS.bgElevated, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: 10 },
  subTop:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  subName: { fontFamily: FONTS.bodySemiBold, fontSize: 14, color: COLORS.text, flex: 1, marginRight: 8 },
  subPct:  { fontFamily: FONTS.headingMedium, fontSize: 15 },
  subMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  subMetaTxt: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textMuted },
  badge:   { fontFamily: FONTS.bodySemiBold, fontSize: 11, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100 },
  progBg:  { height: 6, backgroundColor: COLORS.bg, borderRadius: 3, overflow: 'hidden', position: 'relative' },
  progFill:{ height: '100%', borderRadius: 3, position: 'absolute', left: 0 },
  thresh:  { position: 'absolute', top: 0, bottom: 0, left: '75%', width: 2, backgroundColor: COLORS.warning + '70' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet:   { backgroundColor: COLORS.bgCard, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 24, paddingBottom: Platform.OS === 'ios' ? 42 : 28, borderTopWidth: 1, borderColor: COLORS.border },
  sheetHandle: { width: 38, height: 4, backgroundColor: COLORS.border, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  sheetTitle: { fontFamily: FONTS.headingMedium, fontSize: 18, color: COLORS.text },
  sheetMsg:   { backgroundColor: COLORS.primary + '18', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: COLORS.primary + '35', marginBottom: 16 },
  sheetMsgTxt:{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.primaryLight },
  guideBox:   { backgroundColor: COLORS.bgElevated, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 },
  guideTitleTxt: { fontFamily: FONTS.bodySemiBold, fontSize: 14, color: COLORS.text, marginBottom: 10 },
  guideStep:  { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textSecondary, marginBottom: 6 },
  sheetInputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bgElevated, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, height: 52, marginBottom: 14 },
  sheetInput: { flex: 1, fontFamily: FONTS.body, fontSize: 15, color: COLORS.text },
  sheetPrimaryBtn:    { height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  sheetPrimaryBtnTxt: { fontFamily: FONTS.headingMedium, fontSize: 16, color: '#fff' },
  sheetOutlineBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 14, borderWidth: 1.5 },
  sheetOutlineTxt:    { fontFamily: FONTS.headingMedium, fontSize: 15 },
});
