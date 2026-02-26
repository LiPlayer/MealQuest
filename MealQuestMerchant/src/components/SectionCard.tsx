import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function SectionCard({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <View style={styles.card}>
            <Text style={styles.cardTitle}>{title}</Text>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#ffffff',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#d9e3f0',
        padding: 14,
        gap: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: '#0f172a',
        marginBottom: 4,
    },
});
