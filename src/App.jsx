import React, { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import {
  getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc, setDoc, updateDoc, writeBatch
} from "firebase/firestore";
import {
  Gift, User, Users, Baby, Smile, Trash2, Shuffle, Eye, EyeOff, Send, DollarSign, FileText
} from "lucide-react";

// --- CONFIGURACIÓN BLINDADA ---
// NOTA: El entorno de vista previa aquí no soporta 'import.meta.env'.
// Cuando copies esto a tu VS Code, usa la sección "EN LOCAL" y comenta la sección "TEMPORAL".

const firebaseConfig = {
  // --- EN LOCAL (VITE): DESCOMENTA ESTAS LÍNEAS EN TU PROYECTO ---
   apiKey: import.meta.env.VITE_API_KEY,
   authDomain: import.meta.env.VITE_AUTH_DOMAIN,
   projectId: import.meta.env.VITE_PROJECT_ID,
   storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
   messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
   appId: import.meta.env.VITE_APP_ID

  // --- TEMPORAL: Solo para que el código compile en esta vista previa ---
  // apiKey: "TU_API_KEY", 
  // authDomain: "TU_AUTH_DOMAIN",
  // projectId: "TU_PROJECT_ID",
  // storageBucket: "TU_STORAGE_BUCKET",
  // messagingSenderId: "TU_SENDER_ID",
  // appId: "TU_APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const EVENT_ID = "navidad_2024";

const CATEGORIES = {
  baby: { label: "Bebé", icon: Baby, color: "text-pink-600", bg: "bg-pink-100" },
  kid: { label: "Niño/a", icon: Smile, color: "text-blue-600", bg: "bg-blue-100" },
  adult: { label: "Adulto", icon: User, color: "text-emerald-600", bg: "bg-emerald-100" },
  senior: { label: "Abuelo/a", icon: Users, color: "text-purple-600", bg: "bg-purple-100" },
};

export default function App() {
  const [user, setUser] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [matches, setMatches] = useState([]);
  const [config, setConfig] = useState({ budget: "500", eventName: "Intercambio" });
  const [form, setForm] = useState({ name: "", wishlist: "", category: "adult", phone: "" });
  const [showResults, setShowResults] = useState(false);

  // 1. Auth
  useEffect(() => {
    const login = async () => {
      try {
        await signInAnonymously(auth);
      } catch (e) {
        console.error("Auth error:", e);
        // Si sale este error, revisa que 'Authentication' > 'Sign-in method' > 'Anónimo' esté habilitado en Firebase Console
      }
    };
    login();
    return onAuthStateChanged(auth, setUser);
  }, []);

  // 2. Data Sync
  useEffect(() => {
    if (!user) return;

    // Escuchar Participantes
    const unsubPart = onSnapshot(
      collection(db, "eventos", EVENT_ID, "participantes"),
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        // Ordenar por fecha de creación para mantener el orden visual
        setParticipants(data.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)));
      }
    );

    // Escuchar RESULTADOS (Single Source of Truth)
    const unsubMatch = onSnapshot(
      doc(db, "eventos", EVENT_ID, "sorteo", "resultados_oficiales"),
      (docSnap) => {
        if (docSnap.exists() && docSnap.data().pairs) {
          try {
            setMatches(JSON.parse(docSnap.data().pairs));
          } catch (e) {
            console.error("Error leyendo sorteo", e);
            setMatches([]);
          }
        } else {
          setMatches([]);
        }
      }
    );

    // Escuchar Config
    const unsubConfig = onSnapshot(doc(db, "eventos", EVENT_ID), (s) => {
      if (s.exists()) setConfig(s.data());
    });

    return () => { unsubPart(); unsubMatch(); unsubConfig(); };
  }, [user]);

  // 3. Logic
  const saveConfig = async (newConfig) => {
    const updated = { ...config, ...newConfig };
    setConfig(updated);
    const ref = doc(db, "eventos", EVENT_ID);
    try { await updateDoc(ref, updated); } catch { await setDoc(ref, updated); }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!form.name) return;
    try {
      await addDoc(collection(db, "eventos", EVENT_ID, "participantes"), {
        ...form, createdAt: Date.now()
      });
      setForm({ name: "", wishlist: "", category: "adult", phone: "" });
    } catch (error) {
      console.error("Error al registrar:", error);
      alert("Error al registrar. Revisa la consola.");
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("¿Borrar?")) return;
    await deleteDoc(doc(db, "eventos", EVENT_ID, "participantes", id));
  };

  const generateMatches = async () => {
    if (participants.length < 2) return alert("Mínimo 2 personas.");
    
    // Algoritmo Fisher-Yates (Mezcla justa)
    let pool = [...participants];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    
    // Asignación circular (Cadena cerrada: A->B->C->A)
    const newMatches = pool.map((giver, i) => ({
      giver, receiver: pool[(i + 1) % pool.length],
    }));
    
    // Guardar en 'resultados_oficiales' (Sobrescribe cualquier sorteo anterior)
    try {
      await setDoc(doc(db, "eventos", EVENT_ID, "sorteo", "resultados_oficiales"), {
        pairs: JSON.stringify(newMatches), 
        updatedAt: Date.now(),
      });
      setShowResults(true);
      alert("¡Sorteo realizado con éxito!");
    } catch (error) {
      console.error("Error al guardar sorteo:", error);
      alert("Error al guardar el sorteo. Verifica permisos.");
    }
  };

  const sendWhatsApp = (match) => {
    const text = `🎄 *Intercambio: ${config.eventName}*\n\nHola ${match.giver.name}, te tocó regalar a: \n🎁 *${match.receiver.name}*\n\n📝 *Deseos:* ${match.receiver.wishlist || "Sorpréndeme"}\n💰 *Presupuesto:* $${config.budget}`;
    window.open(`https://wa.me/${match.giver.phone || ""}?text=${encodeURIComponent(text)}`, "_blank");
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-12 text-slate-800">
      <div className="bg-white p-6 sticky top-0 z-20 shadow-sm border-b border-slate-200">
        <div className="max-w-2xl mx-auto space-y-4">
          <input 
            value={config.eventName} 
            onChange={(e) => saveConfig({ eventName: e.target.value })}
            className="text-2xl font-black text-rose-600 w-full outline-none bg-transparent" 
          />
          <div className="flex items-center gap-4 bg-slate-100 p-3 rounded-lg">
            <DollarSign className="w-5 h-5 text-slate-600" />
            <input 
              type="number" value={config.budget} 
              onChange={(e) => saveConfig({ budget: e.target.value })}
              className="bg-transparent font-bold text-lg w-full outline-none" 
            />
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-8">
        <section className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
          <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
            <User className="w-5 h-5 text-indigo-600" /> Nuevo Participante
          </h2>
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input placeholder="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="p-3 bg-slate-50 rounded-lg border w-full" />
              <input placeholder="WhatsApp (52...)" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="p-3 bg-slate-50 rounded-lg border w-full" />
            </div>
            <textarea placeholder="Gustos / Tallas..." value={form.wishlist} onChange={(e) => setForm({ ...form, wishlist: e.target.value })} className="w-full p-3 bg-slate-50 rounded-lg border h-20 resize-none" />
            <div className="flex gap-2 overflow-x-auto pb-2">
              {Object.entries(CATEGORIES).map(([k, v]) => {
                const Icon = v.icon;
                return (
                  <button key={k} type="button" onClick={() => setForm({ ...form, category: k })} className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap border-2 ${form.category === k ? `border-${v.color.split('-')[1]}-500 ${v.bg} ${v.color}` : 'border-transparent bg-slate-100 text-slate-400'}`}>
                    <Icon className="w-4 h-4" /> {v.label}
                  </button>
                )
              })}
            </div>
            <button disabled={!form.name} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl">Agregar</button>
          </form>
        </section>

        <section>
          <div className="flex justify-between items-end mb-3">
            <h3 className="font-bold text-slate-500 text-xs tracking-wider">Registrados ({participants.length})</h3>
            {participants.length > 1 && (
              <button onClick={generateMatches} className="bg-rose-500 text-white px-4 py-2 rounded-lg text-sm font-bold flex gap-2 shadow-lg hover:scale-105 transition">
                <Shuffle className="w-4 h-4" /> Sortear
              </button>
            )}
          </div>
          <div className="grid gap-3">
            {participants.map((p) => {
              const Cat = CATEGORIES[p.category] || CATEGORIES.adult;
              const CIcon = Cat.icon;
              return (
                <div key={p.id} className="bg-white p-4 rounded-xl border border-slate-100 flex justify-between group">
                  <div className="flex gap-3">
                    <div className={`p-2 rounded-lg h-fit ${Cat.bg} ${Cat.color}`}><CIcon className="w-5 h-5" /></div>
                    <div>
                      <p className="font-bold text-slate-800">{p.name}</p>
                      <p className="text-xs text-slate-500 line-clamp-1">{p.wishlist}</p>
                    </div>
                  </div>
                  <button onClick={() => handleDelete(p.id)} className="text-slate-300 hover:text-red-500"><Trash2 className="w-5 h-5" /></button>
                </div>
              );
            })}
          </div>
        </section>

        {matches.length > 0 && (
          <section className="bg-indigo-900 text-white rounded-2xl p-6 shadow-2xl relative overflow-hidden">
            <div className="flex justify-between items-center mb-6 relative z-10">
              <h2 className="text-2xl font-bold">Resultados</h2>
              <button onClick={() => setShowResults(!showResults)} className="bg-white/10 p-2 rounded-lg">{showResults ? <EyeOff /> : <Eye />}</button>
            </div>
            <div className="space-y-4 relative z-10">
              {matches.map((m, i) => (
                <div key={i} className={`bg-white/5 border border-white/10 p-4 rounded-xl ${showResults ? '' : 'hidden'}`}>
                  <div className="flex justify-between mb-2">
                    <span className="font-bold">{m.giver.name}</span>
                    <span className="text-rose-400">➜ {m.receiver.name}</span>
                  </div>
                  <button onClick={() => sendWhatsApp(m)} className="w-full bg-emerald-500 text-white py-2 rounded-lg font-bold text-sm flex justify-center gap-2"><Send className="w-4 h-4" /> WhatsApp</button>
                </div>
              ))}
              {!showResults && <p className="text-center text-indigo-300 italic">Oculto</p>}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}