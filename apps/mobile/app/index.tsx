import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import type { Session } from "@supabase/supabase-js";
import {
  Decimal,
  Money,
  computePortfolioValue,
  type Asset,
  type Holding,
  type PriceQuote,
  type MarketDataProvider,
} from "@finance/core";
import {
  SupabaseAssetRepository,
  SupabaseHoldingRepository,
  SupabaseTradeRepository,
  SupabaseTransactionRepository,
  createMarketDataProvider,
} from "@finance/data";
import { CandleChart, type CandlePoint } from "@finance/ui";
import { supabase } from "../src/lib/supabase.js";

const BASE = "USD";
const HOUR = 3600;

function fx(amount: Money, target: string): Money {
  if (amount.currency === target) return amount;
  if ((amount.currency === "USDT" || amount.currency === "USDC") && target === "USD") {
    return Money.of(amount.amount, "USD");
  }
  return amount;
}

export default function Index() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color="#2563eb" />
      </View>
    );
  }
  if (!session) return <Login />;
  return <Dashboard userId={session.user.id} email={session.user.email ?? ""} />;
}

/* ------------------------------- Login ------------------------------- */

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    const { error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    if (error) setError(error.message);
    setBusy(false);
  }

  return (
    <View style={[styles.screen, styles.center, { padding: 24 }]}>
      <View style={{ width: "100%", maxWidth: 360, gap: 12 }}>
        <Text style={styles.h1}>Finance</Text>
        <Text style={styles.muted}>{mode === "signin" ? "Giriş yap" : "Hesap oluştur"}</Text>
        <TextInput
          style={styles.input}
          placeholder="E-posta"
          placeholderTextColor="#4b5263"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Şifre (min 6)"
          placeholderTextColor="#4b5263"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable style={styles.primaryBtn} onPress={submit} disabled={busy}>
          <Text style={styles.primaryBtnText}>
            {busy ? "…" : mode === "signin" ? "Giriş yap" : "Kayıt ol"}
          </Text>
        </Pressable>
        <Pressable onPress={() => setMode(mode === "signin" ? "signup" : "signin")}>
          <Text style={[styles.muted, { textAlign: "center" }]}>
            {mode === "signin" ? "Hesabın yok mu? Kayıt ol" : "Zaten hesabın var mı? Giriş yap"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ----------------------------- Dashboard ----------------------------- */

function Dashboard({ userId, email }: { userId: string; email: string }) {
  const repos = useMemo(
    () => ({
      assets: new SupabaseAssetRepository(supabase),
      holdings: new SupabaseHoldingRepository(supabase),
      trades: new SupabaseTradeRepository(supabase),
      transactions: new SupabaseTransactionRepository(supabase),
    }),
    [],
  );
  const provider = useMemo(
    () => createMarketDataProvider(process.env.EXPO_PUBLIC_MARKET_DATA_PROVIDER, { tickIntervalMs: 1000 }),
    [],
  );

  const [assets, setAssets] = useState<Asset[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [income, setIncome] = useState<Decimal>(Decimal.ZERO);
  const [expense, setExpense] = useState<Decimal>(Decimal.ZERO);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [a, h, tx] = await Promise.all([
        repos.assets.listActive(),
        repos.holdings.listByUser(userId),
        repos.transactions.listByUser(userId),
      ]);
      setAssets(a);
      setHoldings(h);
      let inc = Decimal.ZERO;
      let exp = Decimal.ZERO;
      for (const t of tx) {
        if (t.type === "income") inc = inc.add(t.amount);
        else exp = exp.add(t.amount);
      }
      setIncome(inc);
      setExpense(exp);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [repos, userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (assets.length === 0) return;
    return provider.subscribe(
      assets.map((a) => a.symbol),
      (tick) => setPrices((p) => ({ ...p, [tick.symbol]: tick.price })),
    );
  }, [assets, provider]);

  const assetsById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);

  const portfolio = useMemo(() => {
    const priceMap = new Map<string, PriceQuote>();
    for (const h of holdings) {
      const asset = assetsById.get(h.assetId);
      const px = asset ? prices[asset.symbol] : undefined;
      if (asset && px) priceMap.set(h.assetId, { price: Decimal.from(px), currency: asset.quoteCurrency });
    }
    return computePortfolioValue(holdings, priceMap, BASE, fx);
  }, [holdings, prices, assetsById]);

  const net = income.subtract(expense);
  const totalNum = Number(portfolio.total.amount.toString());

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <View style={styles.rowBetween}>
        <View>
          <Text style={styles.label}>TOPLAM PORTFÖY</Text>
          <Text style={styles.big}>{fmtUsd(totalNum)} <Text style={{ color: "#22c55e", fontSize: 13 }}>● canlı</Text></Text>
        </View>
        <Pressable onPress={() => supabase.auth.signOut()}>
          <Text style={[styles.muted, { fontSize: 12 }]}>{email}</Text>
          <Text style={[styles.muted, { textAlign: "right" }]}>Çıkış</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={{ flexDirection: "row", gap: 12 }}>
        <Stat label="Gelir" value={fmtUsd(Number(income.toString()))} color="#22c55e" />
        <Stat label="Gider" value={fmtUsd(Number(expense.toString()))} color="#ef4444" />
        <Stat label="Net" value={fmtUsd(Number(net.toString()))} color={net.isNegative() ? "#ef4444" : "#22c55e"} />
      </View>

      <ChartCard assets={assets} provider={provider} />

      <Text style={styles.section}>Pozisyonlar</Text>
      {holdings.length === 0 ? (
        <Text style={styles.muted}>Henüz pozisyon yok. Aşağıdan alım ekle.</Text>
      ) : (
        holdings.map((h) => {
          const asset = assetsById.get(h.assetId);
          const item = portfolio.breakdown.find((b) => b.assetId === h.assetId);
          const value = item ? Number(item.value.amount.toString()) : 0;
          return (
            <View key={h.assetId} style={[styles.card, styles.rowBetween]}>
              <Text style={styles.bold}>{asset?.symbol ?? h.assetId.slice(0, 6)}</Text>
              <Text style={styles.muted}>{h.netQuantity.toString()} adet</Text>
              <Text style={styles.bold}>{value > 0 ? fmtUsd(value) : "…"}</Text>
            </View>
          );
        })
      )}

      <TradeForm assets={assets} userId={userId} repo={repos.trades} onDone={reload} />
      <TransactionForm userId={userId} repo={repos.transactions} onDone={reload} />
    </ScrollView>
  );
}

/* ------------------------------- Chart ------------------------------- */

function ChartCard({ assets, provider }: { assets: Asset[]; provider: MarketDataProvider }) {
  const [symbol, setSymbol] = useState("");
  const [candles, setCandles] = useState<CandlePoint[]>([]);
  const [live, setLive] = useState<CandlePoint | null>(null);

  useEffect(() => {
    if (!symbol && assets.length > 0) setSymbol(assets[0]!.symbol);
  }, [assets, symbol]);

  useEffect(() => {
    if (!symbol) return;
    let active = true;
    const to = new Date();
    const from = new Date(to.getTime() - 48 * HOUR * 1000);
    provider
      .getCandles(symbol, "1h", { from, to })
      .then((cs) => {
        if (!active) return;
        const pts = cs.map((c) => ({
          time: Math.floor(c.openTime.getTime() / 1000),
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close),
        }));
        setCandles(pts);
        setLive(pts.length > 0 ? { ...pts[pts.length - 1]! } : null);
      })
      .catch(() => {
        if (active) {
          setCandles([]);
          setLive(null);
        }
      });
    return () => {
      active = false;
    };
  }, [symbol, provider]);

  useEffect(() => {
    if (!symbol) return;
    return provider.subscribe([symbol], (tick) => {
      const price = Number(tick.price);
      setLive((prev) =>
        prev ? { ...prev, close: price, high: Math.max(prev.high, price), low: Math.min(prev.low, price) } : prev,
      );
    });
  }, [symbol, provider]);

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        {assets.map((a) => (
          <Pressable
            key={a.id}
            onPress={() => setSymbol(a.symbol)}
            style={[styles.chip, symbol === a.symbol && styles.chipActive]}
          >
            <Text style={{ color: symbol === a.symbol ? "white" : "#9aa3b2", fontSize: 12 }}>{a.symbol}</Text>
          </Pressable>
        ))}
      </View>
      <CandleChart data={candles} live={live} height={220} />
    </View>
  );
}

/* ------------------------------- Forms ------------------------------- */

function TradeForm({
  assets,
  userId,
  repo,
  onDone,
}: {
  assets: Asset[];
  userId: string;
  repo: SupabaseTradeRepository;
  onDone: () => void;
}) {
  const [assetId, setAssetId] = useState("");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!assetId && assets.length > 0) setAssetId(assets[0]!.id);
  }, [assets, assetId]);

  async function submit() {
    setErr(null);
    setBusy(true);
    try {
      await repo.create({
        userId,
        accountId: null,
        assetId,
        side,
        quantity: Decimal.from(quantity || "0"),
        price: Decimal.from(price || "0"),
        fee: Decimal.ZERO,
        tradedAt: new Date(),
        note: null,
      });
      setQuantity("");
      setPrice("");
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  return (
    <View style={styles.card}>
      <Text style={styles.bold}>Alım-Satım Ekle</Text>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginVertical: 8 }}>
        {assets.map((a) => (
          <Pressable
            key={a.id}
            onPress={() => setAssetId(a.id)}
            style={[styles.chip, assetId === a.id && styles.chipActive]}
          >
            <Text style={{ color: assetId === a.id ? "white" : "#9aa3b2", fontSize: 12 }}>{a.symbol}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {(["buy", "sell"] as const).map((s) => (
          <Pressable key={s} onPress={() => setSide(s)} style={[styles.chip, side === s && styles.chipActive, { flex: 1 }]}>
            <Text style={{ color: side === s ? "white" : "#9aa3b2", textAlign: "center" }}>
              {s === "buy" ? "Alış" : "Satış"}
            </Text>
          </Pressable>
        ))}
      </View>
      <TextInput style={styles.input} placeholder="Adet" placeholderTextColor="#4b5263" keyboardType="decimal-pad" value={quantity} onChangeText={setQuantity} />
      <TextInput style={styles.input} placeholder="Birim fiyat" placeholderTextColor="#4b5263" keyboardType="decimal-pad" value={price} onChangeText={setPrice} />
      {err && <Text style={styles.error}>{err}</Text>}
      <Pressable style={styles.primaryBtn} onPress={submit} disabled={busy}>
        <Text style={styles.primaryBtnText}>{busy ? "…" : "Kaydet"}</Text>
      </Pressable>
    </View>
  );
}

function TransactionForm({
  userId,
  repo,
  onDone,
}: {
  userId: string;
  repo: SupabaseTransactionRepository;
  onDone: () => void;
}) {
  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    setBusy(true);
    try {
      await repo.create({
        userId,
        accountId: null,
        categoryId: null,
        type,
        amount: Decimal.from(amount || "0"),
        currency: BASE,
        occurredAt: new Date(),
        note: note || null,
      });
      setAmount("");
      setNote("");
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  return (
    <View style={styles.card}>
      <Text style={styles.bold}>Gelir / Gider Ekle</Text>
      <View style={{ flexDirection: "row", gap: 8, marginVertical: 8 }}>
        {(["expense", "income"] as const).map((t) => (
          <Pressable key={t} onPress={() => setType(t)} style={[styles.chip, type === t && styles.chipActive, { flex: 1 }]}>
            <Text style={{ color: type === t ? "white" : "#9aa3b2", textAlign: "center" }}>
              {t === "income" ? "Gelir" : "Gider"}
            </Text>
          </Pressable>
        ))}
      </View>
      <TextInput style={styles.input} placeholder={`Tutar (${BASE})`} placeholderTextColor="#4b5263" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
      <TextInput style={styles.input} placeholder="Not (opsiyonel)" placeholderTextColor="#4b5263" value={note} onChangeText={setNote} />
      {err && <Text style={styles.error}>{err}</Text>}
      <Pressable style={styles.primaryBtn} onPress={submit} disabled={busy}>
        <Text style={styles.primaryBtnText}>{busy ? "…" : "Kaydet"}</Text>
      </Pressable>
    </View>
  );
}

/* ------------------------------- Bits ------------------------------- */

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={[styles.card, { flex: 1 }]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.bold, { color, fontSize: 16 }]}>{value}</Text>
    </View>
  );
}

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0b0e14" },
  center: { justifyContent: "center", alignItems: "center" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  h1: { color: "#e6e9ef", fontSize: 28, fontWeight: "700" },
  big: { color: "#e6e9ef", fontSize: 30, fontWeight: "700" },
  label: { color: "#7d8597", fontSize: 11, letterSpacing: 1 },
  section: { color: "#9aa3b2", fontSize: 14, fontWeight: "600", marginTop: 8 },
  muted: { color: "#7d8597", fontSize: 13 },
  bold: { color: "#e6e9ef", fontWeight: "600" },
  error: { color: "#ef4444", fontSize: 13 },
  card: { backgroundColor: "#11151f", borderColor: "#1b2130", borderWidth: 1, borderRadius: 12, padding: 14, gap: 6 },
  input: {
    backgroundColor: "#0b0e14",
    borderColor: "#2a3142",
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    color: "#e6e9ef",
    fontSize: 14,
  },
  primaryBtn: { backgroundColor: "#2563eb", borderRadius: 8, padding: 12, alignItems: "center", marginTop: 4 },
  primaryBtnText: { color: "white", fontWeight: "600" },
  chip: { backgroundColor: "#11151f", borderColor: "#2a3142", borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
});
