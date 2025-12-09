import React, { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
} from "firebase/firestore";
import {
  Gift,
  LogIn,
  Plus,
  Trash2,
  Shuffle,
  Share2,
  ArrowRight,
  User,
  LogOut,
  Search,
  Users,
} from "lucide-react";

// --- CONFIGURACIÓN ---
const app = initializeApp({
  apiKey: import.meta.env.VITE_API_KEY,
  authDomain: import.meta.env.VITE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_APP_ID,
});

const auth = getAuth(app);
const db = getFirestore(app);

const COUNTRY_CODES = [
  { code: "52", label: "🇲🇽 MX (+52)" },
  { code: "1", label: "🇺🇸 US (+1)" },
  { code: "34", label: "🇪🇸 ES (+34)" },
  { code: "54", label: "🇦🇷 AR (+54)" },
  { code: "57", label: "🇨🇴 CO (+57)" },
  { code: "56", label: "🇨🇱 CL (+56)" },
  { code: "51", label: "🇵🇪 PE (+51)" },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [eventId, setEventId] = useState(localStorage.getItem("eid") || "");
  const [eventData, setEventData] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [results, setResults] = useState([]);

  // Inputs
  const [joinCode, setJoinCode] = useState("");
  const [newPerson, setNewPerson] = useState({
    name: "",
    phone: "",
    likes: "",
  });
  const [phoneCode, setPhoneCode] = useState("52");
  const [newEvent, setNewEvent] = useState({ name: "", budget: "" });

  // ESTADO NUEVO: Búsqueda de resultados para invitados
  const [searchPhone, setSearchPhone] = useState("");

  // 1. Auth Listener
  useEffect(() => auth.onAuthStateChanged(setUser), []);

  // 2. Full Logout
  const fullLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem("eid");
      setEventId("");
      setEventData(null);
      setParticipants([]);
    } catch (e) {
      console.error(e);
    }
  };

  // 3. Sync Data
  useEffect(() => {
    if (!user || !eventId) return;

    const checkAndListen = async () => {
      const docRef = doc(db, "events", eventId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        localStorage.removeItem("eid");
        setEventId("");
        return alert("El evento ya no existe.");
      }

      const unsubEvent = onSnapshot(docRef, (s) => setEventData(s.data()));
      const unsubParts = onSnapshot(
        collection(db, "events", eventId, "list"),
        (s) => setParticipants(s.docs.map((d) => ({ id: d.id, ...d.data() })))
      );
      const unsubRes = onSnapshot(
        doc(db, "events", eventId, "meta", "results"),
        (s) => {
          if (s.exists()) setResults(JSON.parse(s.data().data));
        }
      );

      return () => {
        unsubEvent();
        unsubParts();
        unsubRes();
      };
    };
    checkAndListen();
  }, [user, eventId]);

  // --- ACTIONS ---
  const login = () => signInAnonymously(auth).catch(alert);

  const createEvent = async () => {
    if (!newEvent.name.trim()) return alert("Nombre obligatorio.");
    if (!newEvent.budget || Number(newEvent.budget) <= 0)
      return alert("Presupuesto inválido.");
    const code = Math.random().toString(36).substr(2, 6).toUpperCase();
    await setDoc(doc(db, "events", code), {
      name: newEvent.name,
      budget: newEvent.budget,
      admin: user.uid,
      status: "open",
    });
    setEventId(code);
    localStorage.setItem("eid", code);
  };

  const joinEvent = () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setEventId(code);
    localStorage.setItem("eid", code);
  };

  const handleEnter = (e, action) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      action();
    }
  };

  const addPerson = async () => {
    const name = newPerson.name.trim();
    const phoneRaw = newPerson.phone.trim();
    const likes = newPerson.likes.trim();

    if (!name) return alert("Falta nombre.");
    if (!likes) return alert("Faltan gustos.");
    if (!phoneRaw || phoneRaw.length < 10)
      return alert("Celular inválido (10 dígitos).");

    const fullPhone = `${phoneCode}${phoneRaw}`;

    await setDoc(doc(collection(db, "events", eventId, "list")), {
      name,
      phone: fullPhone,
      likes,
      manager: user.uid,
      createdAt: Date.now(),
    });
    setNewPerson({ name: "", phone: "", likes: "" });

    // Auto-llenar el buscador con el teléfono que acabas de registrar para que veas tus resultados luego
    setSearchPhone(phoneRaw);
  };

  const handleDelete = async (id) => {
    if (confirm("¿Borrar?"))
      await deleteDoc(doc(db, "events", eventId, "list", id));
  };

  const runLottery = async () => {
    if (participants.length < 2) return alert("Mínimo 2 personas.");
    let pool = [...participants];
    pool.sort(() => Math.random() - 0.5);

    const pairs = pool.map((giver, i) => {
      const receiver = pool[(i + 1) % pool.length];
      return {
        giverId: giver.id,
        giverName: giver.name,
        giverManager: giver.manager,
        giverPhone: giver.phone,
        receiver: receiver,
      };
    });

    await setDoc(doc(db, "events", eventId, "meta", "results"), {
      data: JSON.stringify(pairs),
    });
    await updateDoc(doc(db, "events", eventId), { status: "closed" });
  };

  const sendWa = (match) => {
    // Texto limpio con saltos de línea codificados manualmente si es necesario
    const message = `🎄 *INTERCAMBIO: ${eventData.name}* 🎄\n\nHola ${match.giverName}, te tocó regalar a:\n🎁 *${match.receiver.name}*\n\n📝 *Gustos:* ${match.receiver.likes}\n💰 *Presupuesto:* $${eventData.budget}`;

    // Usamos api.whatsapp.com que suele ser más robusto con encoding
    const url = `https://api.whatsapp.com/send?phone=${
      match.giverPhone
    }&text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  };

  // --- LÓGICA DE AGRUPACIÓN (ÁRBOLES) ---
  // Agrupa participantes por teléfono. La clave es el teléfono, el valor es un array ordenado por creación.
  const groupedParticipants = participants.reduce((acc, p) => {
    const key = p.phone || "SIN_TELEFONO";
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  // Ordenar dentro de cada grupo por fecha de creación (El más viejo es el "padre")
  Object.keys(groupedParticipants).forEach((key) => {
    groupedParticipants[key].sort(
      (a, b) => (a.createdAt || 0) - (b.createdAt || 0)
    );
  });

  // --- VISTAS ---
  if (!user)
    return (
      <div className="h-screen grid place-items-center bg-slate-50 p-4 font-sans">
        <div className="text-center space-y-6">
          <div className="flex justify-center">
            <div className="bg-indigo-100 p-4 rounded-full">
              <Gift size={40} className="text-indigo-600" />
            </div>
          </div>
          <h1 className="text-3xl font-black text-slate-800">
            Intercambio Pro
          </h1>
          <button
            onClick={login}
            className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-bold shadow-xl w-full flex justify-center gap-2"
          >
            <LogIn /> Entrar
          </button>
        </div>
      </div>
    );

  if (!eventId || !eventData)
    return (
      <div className="max-w-md mx-auto p-6 space-y-8 pt-12 font-sans text-slate-800">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-black">Bienvenido</h2>
          <button
            onClick={fullLogout}
            className="text-xs text-red-500 font-bold border border-red-100 px-3 py-1 rounded-full bg-red-50"
          >
            Salir
          </button>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-3">
          <label className="font-bold text-xs text-slate-400 uppercase">
            Unirme con código
          </label>
          <div className="flex gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              onKeyDown={(e) => handleEnter(e, createEvent)}
              className="flex-1 p-3 bg-slate-50 rounded-xl font-mono text-center uppercase outline-none border focus:border-indigo-500"
              placeholder="CÓDIGO"
            />
            <button
              onClick={joinEvent}
              className="bg-slate-800 text-white p-3 rounded-xl"
            >
              <ArrowRight />
            </button>
          </div>
        </div>
        <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100 space-y-3">
          <label className="font-bold text-xs text-indigo-400 uppercase">
            Nuevo Evento
          </label>
          <input
            placeholder="Nombre"
            onChange={(e) => setNewEvent({ ...newEvent, name: e.target.value })}
            onKeyDown={(e) => handleEnter(e, createEvent)}
            className="w-full p-3 rounded-xl outline-none"
          />
          <input
            placeholder="Presupuesto"
            type="number"
            onChange={(e) =>
              setNewEvent({ ...newEvent, budget: e.target.value })
            }
            onKeyDown={(e) => handleEnter(e, createEvent)}
            className="w-full p-3 rounded-xl outline-none"
          />
          <button
            onClick={createEvent}
            onKeyDown={(e) => handleEnter(e, createEvent)}
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold mt-2"
          >
            Crear
          </button>
        </div>
      </div>
    );

  // DASHBOARD
  const isAdmin = eventData.admin === user.uid;
  const isClosed = eventData.status === "closed";

  // LÓGICA DE FILTRADO DE RESULTADOS:
  // 1. Si yo lo creé (Manager UID), es mío.
  // 2. Si el teléfono coincide con lo que busqué, es mío.
  const myResults = results.filter((r) => {
    const isMyManager = r.giverManager === user.uid;
    // Comparamos los últimos 10 dígitos para evitar líos con ladas
    const searchClean = searchPhone.replace(/[^0-9]/g, "");
    const isMyPhone =
      searchClean.length >= 10 && r.giverPhone.includes(searchClean);
    return isMyManager || isMyPhone;
  });

  return (
    <div className="min-h-screen bg-slate-50 pb-32 font-sans text-slate-800">
      <div className="bg-white p-4 sticky top-0 z-20 border-b border-slate-200 shadow-sm flex justify-between items-center">
        <div>
          <h1 className="font-bold text-lg">{eventData.name}</h1>
          <p className="text-xs text-slate-500 font-bold">
            CÓDIGO:{" "}
            <span className="bg-indigo-50 text-indigo-700 px-2 rounded font-mono select-all">
              {eventId}
            </span>
          </p>
        </div>
        <button
          onClick={fullLogout}
          className="bg-red-50 p-2 rounded-full text-red-500"
        >
          <LogOut size={18} />
        </button>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-6">
        {/* ZONA DE RESULTADOS */}
        {isClosed && (
          <section className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
            <div className="bg-emerald-100 text-emerald-800 p-4 rounded-xl flex items-center gap-3">
              <Gift />{" "}
              <div>
                <p className="font-bold">¡Resultados Listos!</p>
              </div>
            </div>

            {/* BUSCADOR DE RESULTADOS (SOLO SI NO VEO NADA) */}
            {myResults.length === 0 && (
              <div className="bg-white p-6 rounded-2xl border-2 border-dashed border-indigo-200 text-center space-y-3">
                <p className="font-bold text-indigo-900">
                  ¿No ves tus resultados?
                </p>
                <p className="text-sm text-slate-500">
                  Si entraste con código, escribe tu teléfono para ver a quién
                  le regalas.
                </p>
                <div className="flex gap-2">
                  <input
                    value={searchPhone}
                    onChange={(e) => setSearchPhone(e.target.value)}
                    placeholder="Tu teléfono (10 dígitos)"
                    className="flex-1 p-3 bg-slate-50 rounded-xl border outline-none"
                    type="tel"
                  />
                  <button className="bg-indigo-600 text-white p-3 rounded-xl">
                    <Search size={20} />
                  </button>
                </div>
              </div>
            )}

            {myResults.map((m, i) => (
              <div
                key={i}
                className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm"
              >
                <p className="text-xs font-bold text-slate-400 uppercase">
                  De parte de {m.giverName}
                </p>
                <p className="text-2xl font-black text-slate-800 mb-2">
                  {m.receiver.name}
                </p>
                <div className="bg-slate-50 p-3 rounded-xl text-sm text-slate-600 mb-4 border border-slate-100">
                  "{m.receiver.likes}"
                </div>
                <button
                  onClick={() => sendWa(m)}
                  className="w-full py-3 bg-green-500 text-white font-bold rounded-xl text-sm flex justify-center gap-2 hover:bg-green-600"
                >
                  <Share2 size={18} /> Enviar WhatsApp
                </button>
              </div>
            ))}
          </section>
        )}

        {/* ZONA DE REGISTRO (SI ESTÁ ABIERTO) */}
        {!isClosed && (
          <section className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              <User size={20} className="text-indigo-600" /> Nuevo Participante
            </h3>
            <div className="space-y-3">
              <input
                placeholder="Nombre"
                value={newPerson.name}
                onChange={(e) =>
                  setNewPerson({ ...newPerson, name: e.target.value })
                }
                className="w-full p-3 bg-slate-50 rounded-xl border outline-none focus:border-indigo-500"
              />
              <div className="flex gap-2">
                <select
                  value={phoneCode}
                  onChange={(e) => setPhoneCode(e.target.value)}
                  className="p-3 bg-slate-50 rounded-xl border outline-none w-24 text-sm font-bold"
                >
                  {COUNTRY_CODES.map((c) => (
                    <option key={c.code} value={c.code}>
                      +{c.code}
                    </option>
                  ))}
                </select>
                <input
                  type="tel"
                  maxLength={15}
                  value={newPerson.phone}
                  onChange={(e) =>
                    setNewPerson({
                      ...newPerson,
                      phone: e.target.value.replace(/[^0-9]/g, ""),
                    })
                  }
                  className="flex-1 p-3 bg-slate-50 rounded-xl border outline-none focus:border-indigo-500"
                  placeholder="WhatsApp"
                />
              </div>
              <textarea
                placeholder="Gustos / Tallas..."
                value={newPerson.likes}
                onChange={(e) =>
                  setNewPerson({ ...newPerson, likes: e.target.value })
                }
                className="w-full p-3 bg-slate-50 rounded-xl border h-20 resize-none outline-none focus:border-indigo-500"
              />
              <button
                onClick={addPerson}
                className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold flex justify-center gap-2 hover:scale-[1.01] transition"
              >
                <Plus size={20} /> Guardar
              </button>
            </div>
          </section>
        )}

        {/* LISTA AGRUPADA (ÁRBOLES) */}
        <section>
          <h3 className="font-bold text-slate-400 text-xs uppercase mb-3">
            Registrados en el Evento
          </h3>

          {Object.entries(groupedParticipants).map(([phone, group]) => {
            // El primero es el "Padre"
            const head = group[0];
            // Los demás son hijos/pareja
            const dependents = group.slice(1);
            const isMyGroup = group.some((p) => p.manager === user.uid);

            // Solo muestro botón borrar si soy el manager de ese grupo Y el evento está abierto
            return (
              <div
                key={phone}
                className="mb-4 bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm"
              >
                {/* CABECERA (PRIMER REGISTRADO) */}
                <div className="p-4 bg-slate-50/50 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="bg-indigo-100 text-indigo-600 h-10 w-10 rounded-full flex items-center justify-center font-bold">
                      {head.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">{head.name}</p>
                      <p className="text-xs text-slate-400 font-mono">
                        +{head.phone || "?"}
                      </p>
                    </div>
                  </div>
                  {!isClosed && head.manager === user.uid && (
                    <button
                      onClick={() => handleDelete(head.id)}
                      className="text-slate-300 hover:text-red-500"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>

                {/* DEPENDIENTES (HIJOS/PAREJA) */}
                {dependents.length > 0 && (
                  <div className="border-t border-slate-100">
                    {dependents.map((dep) => (
                      <div
                        key={dep.id}
                        className="p-3 pl-16 flex justify-between items-center hover:bg-slate-50"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-slate-300"></div>
                          <div>
                            <p className="font-medium text-sm text-slate-700">
                              {dep.name}
                            </p>
                            <p className="text-[10px] text-slate-400 truncate w-32">
                              {dep.likes}
                            </p>
                          </div>
                        </div>
                        {!isClosed && dep.manager === user.uid && (
                          <button
                            onClick={() => handleDelete(dep.id)}
                            className="text-slate-300 hover:text-red-500"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      </div>

      {isAdmin && !isClosed && (
        <div className="fixed bottom-6 left-0 w-full flex justify-center px-4 pointer-events-none">
          <button
            onClick={runLottery}
            disabled={participants.length < 2}
            className="pointer-events-auto bg-rose-600 disabled:bg-slate-400 text-white w-full max-w-md py-4 rounded-2xl font-black text-lg shadow-2xl flex justify-center gap-2 hover:scale-105 transition"
          >
            <Shuffle /> SORTEAR
          </button>
        </div>
      )}
    </div>
  );
}
