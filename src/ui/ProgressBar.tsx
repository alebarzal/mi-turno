import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';

import { useTheme } from './theme';

/** Barra de progreso que avanza suave y lleva un brillo que la recorre mientras está activa. */
export function ProgressBar({ value, active = true, height = 8 }: { value: number; active?: boolean; height?: number }) {
  const t = useTheme();
  const fill = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(0);

  useEffect(() => {
    Animated.timing(fill, {
      toValue: Math.max(0, Math.min(1, value)),
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [value, fill]);

  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    );
    sweep.setValue(0);
    loop.start();
    return () => loop.stop();
  }, [active, sweep]);

  const shine = Math.max(40, width * 0.35);
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      style={{ height, borderRadius: height / 2, backgroundColor: t.accentSoft, overflow: 'hidden' }}
    >
      <Animated.View
        style={{
          height: '100%',
          borderRadius: height / 2,
          backgroundColor: t.accent,
          overflow: 'hidden',
          width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }}
      >
        {active && width > 0 ? (
          <Animated.View
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              width: shine,
              backgroundColor: 'rgba(255,255,255,0.35)',
              borderRadius: height / 2,
              transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-shine, width] }) }],
            }}
          />
        ) : null}
      </Animated.View>
    </View>
  );
}
