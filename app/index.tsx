import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withRepeat,
  withSequence, Easing, FadeInDown, FadeInUp,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { saveCredentials, getCredentials } from '../lib/storage';
import { fetchAttendance } from '../lib/api';
import { COLORS, FONTS } from '../lib/theme';

const { width, height } = Dimensions.get('window');

function FloatingOrb({ x, y, size, color, delay }: {
  x: number; y: number; size: number; color: string; delay: number;
}) {
  const ty = useSharedValue(0);
  const op = useSharedValue(0.12);

  useEffect(() => {
    ty.value = withRepeat(
      withSequence(
        withTiming(-18, { duration: 2800 + delay, easing: Easing.inOut(Easing.sin) }),
        withTiming(18, { duration: 2800 + delay, easing: Easing.inOut(Easing.sin) }),
      ), -1, true
    );
    op.value = withRepeat(
      withSequence(
        withTiming(0.22, { duration: 2200 + delay }),
        withTiming(0.07, { duration: 2200 + delay }),
      ), -1, true
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: ty.value }],
    opacity: op.value,
  }));

  return (
    <Animated.View style={[{
      position: 'absolute', left: x, top: y,
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color,
    }, style]} />
  );
}

const ORBS = [
  { x: -50, y: 80,  size: 220, color: COLORS.primary,    delay: 0   },
  { x: width - 110, y: 260, size: 160, color: '#8B5CF6', delay: 400 },
  { x: 30, y: height - 320, size: 130, color: COLORS.primary, delay: 900 },
  { x: width - 90, y: height - 220, size: 190, color: '#4F46E5', delay: 200 },
];

const PILLS = ['Real-time Sync', 'Telegram Alerts', 'Smart Analytics'];

export default function LoginScreen() {
  const [roll, setRoll]         = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError]       = useState('');

  const shakeX    = useSharedValue(0);
  const errorOpac = useSharedValue(0);

  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }));
  const errorStyle = useAnimatedStyle(() => ({ opacity: errorOpac.value }));

  useEffect(() => { checkAutoLogin(); }, []);

  async function checkAutoLogin() {
    const creds = await getCredentials();
    if (creds) {
      try {
        const res = await fetchAttendance(creds.roll, creds.password);
        if (res.status === 'success') {
          router.replace({ pathname: '/dashboard', params: { roll: creds.roll, password: creds.password } });
          return;
        }
      } catch {}
    }
    setChecking(false);
  }

  function shake() {
    shakeX.value = withSequence(
      withTiming(-10, { duration: 55 }), withTiming(10, { duration: 55 }),
      withTiming(-7,  { duration: 55 }), withTiming(7,  { duration: 55 }),
      withTiming(0,   { duration: 55 }),
    );
  }

  function showError(msg: string) {
    setError(msg);
    errorOpac.value = withTiming(1, { duration: 200 });
    shake();
  }

  async function handleLogin() {
    if (!roll.trim() || !password.trim()) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showError('Please enter your roll number and password.');
      return;
    }
    setLoading(true);
    setError('');
    errorOpac.value = withTiming(0);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const res = await fetchAttendance(roll.trim(), password);
      if (res.status === 'success') {
        await saveCredentials(roll.trim(), password);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace({ pathname: '/dashboard', params: { roll: roll.trim(), password } });
      } else {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        showError(res.message || 'Login failed. Check your credentials.');
      }
    } catch {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showError('Network error. Is your internet on?');
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={s.checkingText}>Signing you in…</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      {ORBS.map((o, i) => <FloatingOrb key={i} {...o} />)}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={s.kav}
      >
        {/* Logo */}
        <Animated.View entering={FadeInDown.delay(80).springify()} style={s.logoArea}>
          <LinearGradient colors={[COLORS.primary, '#8B5CF6']} style={s.logoBox}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <Text style={{ fontSize: 30 }}>📊</Text>
          </LinearGradient>
          <Text style={s.appName}>MITS Attendance</Text>
          <Text style={s.appSub}>Track your attendance with ease</Text>
        </Animated.View>

        {/* Pills */}
        <Animated.View entering={FadeInDown.delay(160).springify()} style={s.pillRow}>
          {PILLS.map(p => (
            <View key={p} style={s.pill}>
              <Text style={s.pillText}>{p}</Text>
            </View>
          ))}
        </Animated.View>

        {/* Card */}
        <Animated.View entering={FadeInUp.delay(240).springify()} style={[s.card, shakeStyle]}>
          <Text style={s.cardTitle}>Sign In</Text>

          <View style={s.inputRow}>
            <Ionicons name="person-outline" size={18} color={COLORS.textMuted} style={s.iIcon} />
            <TextInput
              style={s.input} placeholder="Roll Number"
              placeholderTextColor={COLORS.textMuted}
              value={roll} onChangeText={setRoll}
              autoCapitalize="characters" returnKeyType="next"
            />
          </View>

          <View style={s.inputRow}>
            <Ionicons name="lock-closed-outline" size={18} color={COLORS.textMuted} style={s.iIcon} />
            <TextInput
              style={[s.input, { flex: 1 }]} placeholder="Password"
              placeholderTextColor={COLORS.textMuted}
              value={password} onChangeText={setPassword}
              secureTextEntry={!showPw} returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
            <TouchableOpacity onPress={() => setShowPw(v => !v)} style={s.eyeBtn}>
              <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          {!!error && (
            <Animated.View style={[s.errorBox, errorStyle]}>
              <Ionicons name="alert-circle-outline" size={15} color={COLORS.danger} />
              <Text style={s.errorText}>{error}</Text>
            </Animated.View>
          )}

          <TouchableOpacity onPress={handleLogin} disabled={loading} activeOpacity={0.85}>
            <LinearGradient colors={[COLORS.primary, '#8B5CF6']} style={s.loginBtn}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.loginBtnText}>Sign In  →</Text>
              }
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: COLORS.bg },
  kav:          { flex: 1, justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 40 },
  checkingText: { color: COLORS.textMuted, fontFamily: FONTS.body, fontSize: 14, marginTop: 12 },

  logoArea: { alignItems: 'center', marginBottom: 22 },
  logoBox:  { width: 68, height: 68, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  appName:  { fontFamily: FONTS.heading, fontSize: 28, color: COLORS.text, letterSpacing: -0.5 },
  appSub:   { fontFamily: FONTS.body, fontSize: 14, color: COLORS.textMuted, marginTop: 4 },

  pillRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 26, flexWrap: 'wrap' },
  pill:    { backgroundColor: '#1B1B2E', borderWidth: 1, borderColor: '#2A2A45', borderRadius: 100, paddingHorizontal: 13, paddingVertical: 5 },
  pillText:{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.textSecondary },

  card:      { backgroundColor: COLORS.bgCard, borderRadius: 22, padding: 24, borderWidth: 1, borderColor: COLORS.border },
  cardTitle: { fontFamily: FONTS.heading, fontSize: 22, color: COLORS.text, marginBottom: 18 },

  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bgElevated, borderRadius: 13, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12, paddingHorizontal: 14, height: 52 },
  iIcon:    { marginRight: 10 },
  input:    { flex: 1, color: COLORS.text, fontFamily: FONTS.body, fontSize: 15 },
  eyeBtn:   { padding: 5 },

  errorBox:  { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)', borderRadius: 10, padding: 11, marginBottom: 12, gap: 8 },
  errorText: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.danger, flex: 1 },

  loginBtn:     { height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginTop: 4 },
  loginBtnText: { fontFamily: FONTS.headingMedium, fontSize: 16, color: '#fff', letterSpacing: 0.3 },
});
