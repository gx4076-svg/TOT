
import React, { useState } from 'react';
import { authService } from '../services/authService';
import { User } from '../types';

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
    onLoginSuccess: (user: User) => void;
}

const AVATAR_EMOJIS = ['👨‍⚕️', '👩‍⚕️', '🌿', '💊', '🍵', '🐼', '🐯', '🐉', '☯️', '📜'];
const AVATAR_COLORS = [
    'bg-teal-100 text-teal-600',
    'bg-blue-100 text-blue-600',
    'bg-indigo-100 text-indigo-600',
    'bg-rose-100 text-rose-600',
    'bg-amber-100 text-amber-600',
    'bg-emerald-100 text-emerald-600',
    'bg-purple-100 text-purple-600',
    'bg-slate-100 text-slate-600',
];

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onLoginSuccess }) => {
    const [isRegister, setIsRegister] = useState(false);
    const [nickname, setNickname] = useState('');
    const [password, setPassword] = useState('');
    const [selectedAvatar, setSelectedAvatar] = useState(AVATAR_EMOJIS[0]);
    const [selectedColor, setSelectedColor] = useState(AVATAR_COLORS[0]);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!nickname || !password) {
            setError('请填写完整信息');
            return;
        }

        if (isRegister) {
            const result = authService.register(nickname, password, selectedAvatar, selectedColor);
            if (result.success && result.user) {
                onLoginSuccess(result.user);
                onClose();
            } else {
                setError(result.message);
            }
        } else {
            const result = authService.login(nickname, password);
            if (result.success && result.user) {
                onLoginSuccess(result.user);
                onClose();
            } else {
                setError(result.message);
            }
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-white/90 backdrop-blur-2xl p-8 rounded-3xl shadow-2xl w-full max-w-sm animate-pop border border-white/50">
                
                {/* Tabs */}
                <div className="flex bg-slate-100 rounded-xl p-1 mb-6">
                    <button 
                        onClick={() => { setIsRegister(false); setError(''); }}
                        className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${!isRegister ? 'bg-white shadow text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        登录
                    </button>
                    <button 
                        onClick={() => { setIsRegister(true); setError(''); }}
                        className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${isRegister ? 'bg-white shadow text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        注册账号
                    </button>
                </div>

                <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold text-slate-800 serif">
                        {isRegister ? '加入中医方剂溯源' : '欢迎回来'}
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">
                        {isRegister ? '创建您的专属数据空间' : '登录以同步您的收藏与笔记'}
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    
                    {/* Avatar Selection (Register Only) */}
                    {isRegister && (
                        <div className="mb-4">
                            <label className="block text-xs font-bold text-slate-400 mb-2 text-center">选择您的头像</label>
                            <div className="flex justify-center mb-3">
                                <div className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl shadow-inner border-4 border-white ${selectedColor}`}>
                                    {selectedAvatar}
                                </div>
                            </div>
                            <div className="flex flex-wrap justify-center gap-2 mb-2">
                                {AVATAR_EMOJIS.map(emoji => (
                                    <button
                                        key={emoji}
                                        type="button"
                                        onClick={() => setSelectedAvatar(emoji)}
                                        className={`w-8 h-8 flex items-center justify-center rounded-lg text-lg transition hover:bg-slate-100 ${selectedAvatar === emoji ? 'bg-white shadow ring-2 ring-indigo-200' : ''}`}
                                    >
                                        {emoji}
                                    </button>
                                ))}
                            </div>
                            <div className="flex justify-center gap-2">
                                {AVATAR_COLORS.map((color, i) => (
                                    <button
                                        key={i}
                                        type="button"
                                        onClick={() => setSelectedColor(color)}
                                        className={`w-5 h-5 rounded-full ${color.split(' ')[0]} ${selectedColor === color ? 'ring-2 ring-offset-2 ring-slate-300' : 'hover:scale-110'}`}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    <div>
                        <input 
                            type="text" 
                            value={nickname}
                            onChange={e => setNickname(e.target.value)}
                            className="w-full p-3 rounded-xl border border-slate-200 bg-white/50 focus:ring-2 ring-indigo-500 outline-none text-center font-medium"
                            placeholder="请输入昵称"
                        />
                    </div>
                    <div>
                        <input 
                            type="password" 
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="w-full p-3 rounded-xl border border-slate-200 bg-white/50 focus:ring-2 ring-indigo-500 outline-none text-center font-medium"
                            placeholder="请输入密码"
                        />
                    </div>

                    {error && (
                        <div className="text-rose-500 text-xs text-center font-bold bg-rose-50 py-2 rounded-lg">
                            {error}
                        </div>
                    )}

                    <button type="submit" className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 text-white py-3 rounded-xl font-bold hover:shadow-lg transition transform active:scale-95">
                        {isRegister ? '立即注册' : '登录'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default AuthModal;
