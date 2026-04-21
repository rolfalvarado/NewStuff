"use client";

import { useEffect, useState, useRef } from 'react';

interface AlertModalProps {
    offlineSystems: { url_sitio: string; nombre_empresa: string; nombre_servidor?: string }[];
    onAcknowledge: () => void;
}

export default function AlertModal({ offlineSystems, onAcknowledge }: AlertModalProps) {
    if (offlineSystems.length === 0) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
        }}>
            <div style={{
                backgroundColor: '#fff',
                padding: '2rem',
                borderRadius: 'var(--radius-lg)',
                maxWidth: '600px',
                width: '90%',
                boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
                textAlign: 'center',
                fontFamily: 'var(--font-inter), sans-serif'
            }}>
                <div style={{ marginBottom: '1.5rem', color: '#ef4444' }}>
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>


                <p style={{ marginBottom: '1.5rem', color: '#4b5563', fontSize: '1.1rem', fontWeight: 'bold' }}>
                    ¡Alerta de Caída de Sistema!
                </p>

                <p style={{ marginBottom: '1rem', color: '#4b5563', fontSize: '0.9rem' }}>
                    Los siguientes sistemas se encuentran Offline
                </p>

                <div style={{
                    marginBottom: '2rem',
                    maxHeight: '300px',
                    overflowY: 'auto',
                    textAlign: 'left',
                    backgroundColor: '#fee2e2',
                    padding: '1rem',
                    borderRadius: '8px',
                    border: '1px solid #fecaca'
                }}>
                    {offlineSystems.map(sys => (
                        <div key={sys.url_sitio} style={{
                            padding: '0.75rem 0',
                            borderBottom: '1px solid #fecaca',
                            color: '#991b1b',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.25rem'
                        }}>
                            <div style={{ fontWeight: '700', fontSize: '1.05rem' }}>
                                {sys.nombre_empresa}
                            </div>
                            <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>
                                <strong>URL:</strong> {sys.url_sitio}
                            </div>
                            {sys.nombre_servidor && (
                                <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>
                                    <strong>Servidor:</strong> {sys.nombre_servidor}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <button
                    onClick={onAcknowledge}
                    className="btn"
                    style={{
                        backgroundColor: '#ef4444',
                        color: 'white',
                        padding: '0.75rem 2rem',
                        fontSize: '1rem',
                        fontWeight: '600',
                        letterSpacing: '0.5px',
                        minWidth: '180px',
                        boxShadow: '0 4px 6px rgba(239, 68, 68, 0.2)'
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.backgroundColor = '#dc2626';
                        e.currentTarget.style.transform = 'scale(1.02)';
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.backgroundColor = '#ef4444';
                        e.currentTarget.style.transform = 'scale(1)';
                    }}
                >
                    Aceptar
                </button>
            </div>
        </div>
    );
}
