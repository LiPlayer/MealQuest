import React, {useMemo, useState} from 'react';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';

import {
  approveProposal,
  createInitialMerchantState,
  smartCashierVerify,
  toggleKillSwitch,
  triggerCampaigns,
} from './src/domain/merchantEngine';

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export default function App() {
  const [merchantState, setMerchantState] = useState(createInitialMerchantState);
  const [lastAction, setLastAction] = useState('待命中');

  const pendingProposals = useMemo(
    () => merchantState.pendingProposals.filter(item => item.status === 'PENDING'),
    [merchantState.pendingProposals],
  );

  const onApproveRainy = () => {
    setMerchantState(prev => approveProposal(prev, 'proposal_rainy'));
    setLastAction('已确认策略：暴雨急售策略');
  };

  const onToggleKillSwitch = () => {
    setMerchantState(prev => {
      const nextEnabled = !prev.killSwitchEnabled;
      setLastAction(nextEnabled ? '已开启预算熔断' : '已关闭预算熔断');
      return toggleKillSwitch(prev, nextEnabled);
    });
  };

  const onTriggerRainyEvent = () => {
    setMerchantState(prev => {
      const result = triggerCampaigns(prev, 'WEATHER_CHANGE', {weather: 'RAIN'});
      if (result.blockedByKillSwitch) {
        setLastAction('熔断中，策略未执行');
      } else if (result.executedIds.length > 0) {
        setLastAction(`已执行策略：${result.executedIds.join(', ')}`);
      } else {
        setLastAction('无匹配策略执行');
      }
      return result.nextState;
    });
  };

  const onVerifyCashier = () => {
    const settlement = smartCashierVerify({
      orderAmount: 52,
      voucherValue: 18,
      bonusBalance: 10,
      principalBalance: 20,
    });
    setLastAction(
      `智能核销完成，外部支付 ¥${settlement.payable.toFixed(2)}（券 ${settlement.deduction.voucher.toFixed(2)}）`,
    );
  };

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.appTitle}>有戏掌柜驾驶舱</Text>
          <Text style={styles.appSubtitle}>
            聚合收银、策略确认、预算熔断一体化
          </Text>

          <SectionCard title="经营总览">
            <Text style={styles.dataLine}>门店：{merchantState.merchantName}</Text>
            <Text style={styles.dataLine}>
              营销预算：¥{merchantState.budgetUsed.toFixed(2)} / ¥
              {merchantState.budgetCap.toFixed(2)}
            </Text>
            <Text style={styles.dataLine}>
              熔断状态：{merchantState.killSwitchEnabled ? '已开启' : '运行中'}
            </Text>
            <Pressable
              testID="kill-switch-btn"
              style={styles.secondaryButton}
              onPress={onToggleKillSwitch}>
              <Text style={styles.secondaryButtonText}>
                {merchantState.killSwitchEnabled ? '关闭熔断' : '开启熔断'}
              </Text>
            </Pressable>
          </SectionCard>

          <SectionCard title="决策收件箱">
            {pendingProposals.length === 0 ? (
              <Text style={styles.mutedText}>暂无待确认策略</Text>
            ) : (
              pendingProposals.map(item => (
                <View key={item.id} style={styles.listRow}>
                  <Text style={styles.dataLine}>{item.title}</Text>
                  <Pressable
                    testID={`approve-${item.id}`}
                    style={styles.primaryButton}
                    onPress={onApproveRainy}>
                    <Text style={styles.primaryButtonText}>确认执行</Text>
                  </Pressable>
                </View>
              ))
            )}
          </SectionCard>

          <SectionCard title="收银台模拟">
            <Text style={styles.dataLine}>测试账单：¥52.00</Text>
            <Text style={styles.mutedText}>
              规则：临期券优先 -> 赠送金 -> 本金 -> 外部支付
            </Text>
            <Pressable
              testID="verify-cashier-btn"
              style={styles.primaryButton}
              onPress={onVerifyCashier}>
              <Text style={styles.primaryButtonText}>执行智能核销</Text>
            </Pressable>
          </SectionCard>

          <SectionCard title="TCA 触发演练">
            <Text style={styles.mutedText}>
              先确认“暴雨急售策略”，再触发 WEATHER_CHANGE(RAIN)
            </Text>
            <Pressable
              testID="trigger-rain-event"
              style={styles.primaryButton}
              onPress={onTriggerRainyEvent}>
              <Text style={styles.primaryButtonText}>触发暴雨事件</Text>
            </Pressable>
          </SectionCard>

          <SectionCard title="执行日志">
            <Text testID="last-action-text" style={styles.dataLine}>
              {lastAction}
            </Text>
          </SectionCard>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  container: {
    padding: 16,
    gap: 12,
  },
  appTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
  },
  appSubtitle: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 4,
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  dataLine: {
    fontSize: 14,
    color: '#1e293b',
  },
  mutedText: {
    fontSize: 13,
    color: '#64748b',
  },
  listRow: {
    gap: 8,
  },
  primaryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#0f766e',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  primaryButtonText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '600',
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  secondaryButtonText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '600',
  },
});
