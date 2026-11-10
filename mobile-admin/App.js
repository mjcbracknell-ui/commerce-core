import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

// Android emulator reaches the host machine at 10.0.2.2.
// Change this to your server URL for a physical device.
const API_BASE = 'http://10.0.2.2:4000';

async function api(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`);
  return data;
}

const money = (value) => `$${(Number(value) || 0).toFixed(2)}`;

export default function App() {
  const [email, setEmail] = useState('admin@demo.com');
  const [password, setPassword] = useState('Admin123!');
  const [token, setToken] = useState(null);
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const signIn = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api('/api/auth/login', { method: 'POST', body: { email, password } });
      setToken(data.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const [summary, orderData] = await Promise.all([
        api('/api/admin/analytics/summary', { token }),
        api('/api/admin/orders?limit=8', { token }),
      ]);
      setStats(summary);
      setOrders(orderData.orders || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const fulfill = async (order) => {
    try {
      await api(`/api/admin/orders/${order.id}/fulfill`, {
        method: 'POST',
        token,
        body: { notifyCustomer: false },
      });
      Alert.alert('Order fulfilled', `#${order.number} is marked as fulfilled.`);
      load();
    } catch (err) {
      Alert.alert('Could not fulfil order', err.message);
    }
  };

  if (!token) {
    return (
      <View style={styles.loginWrap}>
        <Text style={styles.brand}>Commerce Core</Text>
        <Text style={styles.sub}>Store admin</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Email"
        />
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Password"
        />
        <TouchableOpacity style={styles.button} onPress={signIn} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Signing in…' : 'Sign in'}</Text>
        </TouchableOpacity>
        <Text style={styles.hint}>API: {API_BASE}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>Dashboard</Text>
          <Text style={styles.sub}>Signed in as {email}</Text>
        </View>
        <TouchableOpacity onPress={() => setToken(null)}>
          <Text style={styles.signOut}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {stats ? (
        <View style={styles.statGrid}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Revenue</Text>
            <Text style={styles.statValue}>{money(stats.revenue)}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Orders</Text>
            <Text style={styles.statValue}>{stats.orders_count}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Customers</Text>
            <Text style={styles.statValue}>{stats.customers_count}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Low stock</Text>
            <Text style={styles.statValue}>{stats.low_stock_count}</Text>
          </View>
        </View>
      ) : (
        <ActivityIndicator style={{ marginTop: 24 }} />
      )}

      <Text style={styles.sectionTitle}>Recent orders</Text>
      {orders.map((order) => (
        <View key={order.id} style={styles.orderCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.orderTitle}>#{order.number}</Text>
            <Text style={styles.orderMeta}>
              {order.email} · {money(order.total)}
            </Text>
            <Text style={styles.orderMeta}>
              {order.financial_status} · {order.fulfillment_status}
            </Text>
          </View>
          {order.fulfillment_status !== 'fulfilled' ? (
            <TouchableOpacity style={styles.smallButton} onPress={() => fulfill(order)}>
              <Text style={styles.smallButtonText}>Fulfil</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.done}>✓</Text>
          )}
        </View>
      ))}
      {!orders.length && !loading ? <Text style={styles.hint}>No orders yet.</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f7f4ed' },
  content: { padding: 20, paddingTop: 56, paddingBottom: 48 },
  loginWrap: { flex: 1, backgroundColor: '#f7f4ed', padding: 28, justifyContent: 'center' },
  brand: { fontSize: 28, fontWeight: '600', color: '#161513' },
  sub: { color: '#6f6a61', marginBottom: 18 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd6c8',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  button: { backgroundColor: '#c4502f', borderRadius: 999, padding: 15, alignItems: 'center', marginTop: 6 },
  buttonText: { color: '#fff', fontWeight: '600' },
  hint: { color: '#6f6a61', fontSize: 12, marginTop: 16 },
  error: { color: '#8d2d24', marginBottom: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  signOut: { color: '#c4502f', paddingTop: 8 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  stat: { width: '47%', backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd6c8', borderRadius: 12, padding: 14 },
  statLabel: { fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: '#6f6a61' },
  statValue: { fontSize: 22, marginTop: 4, color: '#161513' },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginTop: 20, marginBottom: 10 },
  orderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd6c8',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  orderTitle: { fontWeight: '700', color: '#161513' },
  orderMeta: { color: '#6f6a61', fontSize: 12 },
  smallButton: { backgroundColor: '#161513', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  smallButtonText: { color: '#fff', fontSize: 12 },
  done: { color: '#2f6b3a', fontSize: 20 },
});
