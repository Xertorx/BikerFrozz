import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  Box, 
  ClipboardList, 
  CreditCard, 
  History, 
  LayoutDashboard, 
  LogOut, 
  Menu,
  Plus, 
  Search, 
  ShoppingCart, 
  TrendingUp,
  AlertTriangle,
  Download,
  Trash2,
  RefreshCcw,
  Bike,
  X
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import axios from 'axios';
import * as XLSX from 'xlsx';

import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter,
  DialogTrigger
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

// Types
interface Product {
  id: number;
  nombre: string;
  precio: number;
  stock: number;
  imagen_url?: string;
}

interface Sale {
  id: number;
  fecha: string;
  total: number;
  metodo_pago: string;
}

interface CartItem extends Product {
  cantidad: number;
}

const COLORS = ['#ff4e00', '#3b82f6', '#00c853', '#ffd600', '#8b5cf6'];

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [metodoPago, setMetodoPago] = useState('Efectivo');
  const [montoRecibido, setMontoRecibido] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'day' | 'week' | 'month' | 'specific' | 'custom'>('all');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterSingleDate, setFilterSingleDate] = useState('');

  // Mobile state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Modals States
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleteHistoryModalOpen, setIsDeleteHistoryModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [newProduct, setNewProduct] = useState<Partial<Product>>({
    nombre: '',
    precio: 0,
    stock: 0,
    imagen_url: ''
  });

  // Stats
  const [productSales, setProductSales] = useState<any[]>([]);
  const [dailySales, setDailySales] = useState<any[]>([]);

  useEffect(() => {
    if (isLoggedIn) {
      fetchProducts();
      fetchSales();
      fetchStats();
    }
  }, [isLoggedIn]);

  useEffect(() => {
    const checkDb = async () => {
      try {
        const res = await axios.get('/api/health');
        if (res.data.database !== 'connected') {
          toast.error('Error de conexión con la base de datos Supabase');
        }
      } catch (error) {
        toast.error('No se pudo establecer conexión con el servidor PostgreSQL/Supabase. Verifique DATABASE_URL.');
      }
    };
    checkDb();
  }, []);

  const fetchProducts = async () => {
    try {
      const res = await axios.get('/api/productos');
      setProducts(res.data);
    } catch (err) {
      toast.error("Error al cargar productos");
    }
  };

  const fetchSales = async () => {
    try {
      const res = await axios.get('/api/ventas');
      setSales(res.data);
    } catch (err) {
      toast.error("Error al cargar ventas");
    }
  };

  const fetchStats = async () => {
    try {
      const pRes = await axios.get('/api/stats/products');
      setProductSales(pRes.data);
      const dRes = await axios.get('/api/stats/daily');
      setDailySales(dRes.data);
    } catch (err) {
      toast.error("Error al cargar estadísticas");
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await axios.post('/api/login', { username, password });
      if (res.data.success) {
        setIsLoggedIn(true);
        toast.success("Bienvenido a Biker Frozz");
      } else {
        toast.error(res.data.message || "Usuario o contraseña incorrectos");
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || "Error al conectar con el servidor de autenticación";
      toast.error(errorMsg);
      console.error("Login detail error:", err.response?.data || err);
    }
  };

  const addToCart = (product: Product) => {
    if (product.stock <= 0) {
      toast.error("Producto sin stock");
      return;
    }
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        if (existing.cantidad >= product.stock) {
          toast.error("Stock insuficiente");
          return prev;
        }
        return prev.map(item => item.id === product.id ? { ...item, cantidad: item.cantidad + 1 } : item);
      }
      return [...prev, { ...product, cantidad: 1 }];
    });
  };

  const removeFromCart = (id: number) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const totalCart = cart.reduce((acc, item) => acc + (item.precio * item.cantidad), 0);
  const cambio = montoRecibido - totalCart;

  const todayRevenue = (() => {
    const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
    
    // Fallback: Calculate direct from sales list first (for immediate reactivity)
    const totalFromSales = sales
      .filter(s => {
        try {
          return new Date(s.fecha).toLocaleDateString('en-CA') === todayStr;
        } catch (e) {
          return false;
        }
      })
      .reduce((acc, s) => acc + s.total, 0);

    // If server stats are available, use them if they match, but prefer local calculation for better sync
    const statsToday = dailySales.find(d => {
      try {
        // If d.date is just "YYYY-MM-DD", new Date(d.date) might be UTC and off by one day
        // We compare directly as string if possible
        const dDateStr = d.date.includes('T') ? new Date(d.date).toLocaleDateString('en-CA') : d.date.split('T')[0];
        return dDateStr === todayStr;
      } catch (e) {
        return false;
      }
    });

    return Math.max(statsToday?.revenue || 0, totalFromSales);
  })();

  const filteredSales = sales.filter(s => {
    const saleDate = new Date(s.fecha);
    const now = new Date();
    
    if (historyFilter === 'all') return true;
    
    if (historyFilter === 'day') {
      return saleDate.toLocaleDateString('en-CA') === now.toLocaleDateString('en-CA');
    }
    
    if (historyFilter === 'week') {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(now.getDate() - 7);
      return saleDate >= oneWeekAgo;
    }
    
    if (historyFilter === 'month') {
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(now.getMonth() - 1);
      return saleDate >= oneMonthAgo;
    }

    if (historyFilter === 'specific') {
      if (!filterSingleDate) return true;
      return saleDate.toLocaleDateString('en-CA') === filterSingleDate;
    }
    
    if (historyFilter === 'custom') {
      const start = filterStartDate ? new Date(filterStartDate + 'T00:00:00') : null;
      const end = filterEndDate ? new Date(filterEndDate + 'T23:59:59') : null;
      
      if (start && end) return saleDate >= start && saleDate <= end;
      if (start) return saleDate >= start;
      if (end) return saleDate <= end;
      return true;
    }
    
    return true;
  });

  const handleProcessSale = async () => {
    if (cart.length === 0) return;
    if (metodoPago === 'Efectivo' && montoRecibido < totalCart) {
      toast.error("Monto recibido insuficiente");
      return;
    }

    try {
      await axios.post('/api/ventas', {
        total: totalCart,
        metodo_pago: metodoPago,
        items: cart
      });
      toast.success("Venta registrada con éxito");
      setCart([]);
      setMontoRecibido(0);
      fetchProducts();
      fetchSales();
      fetchStats();
    } catch (err) {
      toast.error("Error al procesar la venta");
    }
  };

  const handleSaveProduct = async () => {
    if (!newProduct.nombre || newProduct.precio === undefined || newProduct.stock === undefined) {
      toast.error("Por favor complete los campos obligatorios");
      return;
    }

    if (newProduct.precio < 0 || newProduct.stock < 0) {
      toast.error("El precio y el stock no pueden ser negativos");
      return;
    }

    try {
      if (editingProduct) {
        await axios.put(`/api/productos/${editingProduct.id}`, newProduct);
        toast.success("Producto actualizado");
      } else {
        await axios.post('/api/productos', newProduct);
        toast.success("Producto creado");
      }
      setIsProductModalOpen(false);
      setEditingProduct(null);
      setNewProduct({ nombre: '', precio: 0, stock: 0, imagen_url: '' });
      fetchProducts();
    } catch (err) {
      toast.error("Error al guardar el producto");
    }
  };

  const handleDeleteProduct = async () => {
    if (!productToDelete) return;
    try {
      await axios.delete(`/api/productos/${productToDelete.id}`);
      toast.success("Producto eliminado correctamente");
      setIsDeleteModalOpen(false);
      setProductToDelete(null);
      fetchProducts();
    } catch (err) {
      toast.error("Error al eliminar el producto");
    }
  };

  const handleDeleteHistory = async () => {
    try {
      await axios.delete('/api/ventas');
      toast.success("Historial eliminado correctamente");
      setIsDeleteHistoryModalOpen(false);
      fetchSales();
      fetchStats();
    } catch (err) {
      toast.error("Error al eliminar el historial");
    }
  };

  const confirmDelete = (product: Product) => {
    setProductToDelete(product);
    setIsDeleteModalOpen(true);
  };

  const openAddModal = () => {
    setEditingProduct(null);
    setNewProduct({ nombre: '', precio: 0, stock: 0, imagen_url: '' });
    setIsProductModalOpen(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setNewProduct(product);
    setIsProductModalOpen(true);
  };

  const exportInventory = () => {
    const ws = XLSX.utils.json_to_sheet(products);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventario");
    XLSX.writeFile(wb, "Inventario_Biker_Frozz.xlsx");
    toast.success("Inventario exportado");
  };

  const exportSales = () => {
    const ws = XLSX.utils.json_to_sheet(sales);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ventas");
    XLSX.writeFile(wb, "Ventas_Biker_Frozz.xlsx");
    toast.success("Ventas exportadas");
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <Card className="sleek-card border-none shadow-2xl">
            <CardHeader className="text-center pt-10">
              <div className="mx-auto w-24 h-24 mb-6 relative group">
                <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl group-hover:bg-primary/30 transition-all duration-500 animate-pulse"></div>
                <img 
                  src="https://picsum.photos/seed/raspado_pos/400/400" 
                  className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-2xl relative z-10 transition-transform hover:scale-105 duration-500" 
                  alt="Biker Frozz Logo"
                  referrerPolicy="no-referrer"
                />
              </div>
              <CardTitle className="text-4xl font-black tracking-tighter text-foreground uppercase">BIKER FROZZ</CardTitle>
              <CardDescription className="text-muted-foreground font-medium">SISTEMA INTEGRAL DE GESTIÓN</CardDescription>
            </CardHeader>
            <CardContent className="pb-10">
              <form onSubmit={handleLogin} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-[0.2em] ml-1">Usuario</label>
                  <Input 
                    className="bg-secondary/50 border-border h-12 rounded-xl text-foreground font-medium" 
                    placeholder="admin" 
                    value={username} 
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-[0.2em] ml-1">Contraseña</label>
                  <Input 
                    type="password" 
                    className="bg-secondary/50 border-border h-12 rounded-xl text-foreground font-medium" 
                    placeholder="••••••••" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-white font-black h-14 rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-[0.98]">
                  INICIAR SESIÓN
                </Button>
              </form>
            </CardContent>
          </Card>
          <p className="text-center mt-8 text-muted-foreground/50 text-[10px] uppercase tracking-[0.3em] font-bold">
            &copy; 2024 Biker Frozz Management System
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row font-sans">
      {/* Mobile Header */}
      <header className="lg:hidden h-16 flex items-center justify-between px-4 bg-card border-b border-border z-50">
        <div className="flex items-center">
           <img 
              src="https://picsum.photos/seed/shavedice_icon/200/200" 
              className="w-8 h-8 rounded-lg object-cover shadow-sm mr-2" 
              alt="Logo" 
              referrerPolicy="no-referrer"
           />
           <h1 className="text-lg font-black text-foreground tracking-tighter uppercase italic">BIKER<span className="text-primary italic">FROZZ</span></h1>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'ventas' && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="relative" 
              onClick={() => setIsCartOpen(!isCartOpen)}
            >
              <ShoppingCart size={20} />
              {cart.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-primary text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                  {cart.length}
                </span>
              )}
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </Button>
        </div>
      </header>

      {/* Sidebar - Desktop & Mobile Overlay */}
      <div className={`
        fixed inset-0 z-40 bg-black/50 lg:hidden transition-opacity ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}
      `} onClick={() => setIsMobileMenuOpen(false)} />

      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 w-[260px] bg-card border-r border-border flex flex-col shadow-sm transition-transform duration-300 lg:translate-x-0
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-8 hidden lg:flex items-center border-b border-border mb-4">
          <div className="mr-3">
             <img 
                src="https://picsum.photos/seed/shavedice_icon/200/200" 
                className="w-10 h-10 rounded-xl object-cover shadow-md border border-border" 
                alt="Logo" 
                referrerPolicy="no-referrer"
             />
          </div>
          <h1 className="text-xl font-black text-foreground tracking-tighter uppercase italic">BIKER<span className="text-primary italic">FROZZ</span></h1>
        </div>
        
        <nav className="flex-1 px-4 py-8 lg:py-0 space-y-1">
          <NavItem icon={<LayoutDashboard size={18} />} label="Panel de Control" active={activeTab === 'dashboard'} onClick={() => { setActiveTab('dashboard'); setIsMobileMenuOpen(false); }} />
          <NavItem icon={<Box size={18} />} label="Inventario" active={activeTab === 'inventario'} onClick={() => { setActiveTab('inventario'); setIsMobileMenuOpen(false); }} />
          <NavItem icon={<ShoppingCart size={18} />} label="Punto de Venta" active={activeTab === 'ventas'} onClick={() => { setActiveTab('ventas'); setIsMobileMenuOpen(false); }} />
          <NavItem icon={<History size={18} />} label="Historial" active={activeTab === 'historial'} onClick={() => { setActiveTab('historial'); setIsMobileMenuOpen(false); }} />
          <NavItem icon={<BarChart3 size={18} />} label="Estadísticas" active={activeTab === 'analíticas'} onClick={() => { setActiveTab('analíticas'); setIsMobileMenuOpen(false); }} />
        </nav>

        <div className="p-4 mt-auto">
          <div className="bg-secondary/50 p-4 border border-border rounded-xl space-y-1 mb-4">
            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">PostgreSQL Ready</p>
            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">User: {username}</p>
          </div>
          <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl font-bold" onClick={() => setIsLoggedIn(false)}>
            <LogOut size={18} className="mr-2" />
            Cerrar Sesión
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex flex-col w-full">
        <header className="hidden lg:flex h-24 glass-header items-center justify-between px-10">
          <div>
            <h2 className="text-3xl font-black text-foreground tracking-tight capitalize">{activeTab === 'dashboard' ? 'Panel General' : activeTab}</h2>
            <p className="text-sm text-muted-foreground font-medium">Biker Frozz Gestor de Bar & POS</p>
          </div>
          <div className="flex items-center space-x-6">
            <div className="flex items-center bg-secondary/80 border border-border px-5 py-2.5 rounded-2xl text-sm font-bold shadow-sm">
              <div className="w-2.5 h-2.5 bg-green-500 rounded-full mr-3 shadow-[0_0_10px_rgba(34,197,94,0.4)] animate-pulse"></div>
              {username.toUpperCase()}
            </div>
          </div>
        </header>

        {/* Mobile Sub-Header */}
        <div className="lg:hidden p-4 pb-0">
          <h2 className="text-2xl font-black text-foreground tracking-tight capitalize">{activeTab === 'dashboard' ? 'Panel General' : activeTab}</h2>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 lg:p-8">
            <AnimatePresence mode="wait">
              {activeTab === 'dashboard' && (
                <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-10">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    <StatCard title="Ventas de Hoy" value={`$${todayRevenue.toLocaleString()}`} icon={<TrendingUp className="text-primary" />} />
                    <StatCard title="Transacciones" value={sales.length} icon={<History className="text-primary" />} />
                    <StatCard title="Stock Activo" value={products.length} icon={<Box className="text-primary" />} />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                    <div className="lg:col-span-2 space-y-10">
                      <Card className="sleek-card border-none">
                        <CardHeader className="flex flex-row items-center justify-between pb-6 border-b border-border/50">
                          <CardTitle className="text-xl font-bold">Resumen de Ingresos</CardTitle>
                        </CardHeader>
                        <CardContent className="h-80 pt-10">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={dailySales}>
                              <CartesianGrid strokeDasharray="0" stroke="#f1f3f5" vertical={false} />
                              <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} axisLine={false} tickLine={false} />
                              <YAxis stroke="#94a3b8" fontSize={12} axisLine={false} tickLine={false} />
                              <Tooltip 
                                cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                              />
                              <Bar dataKey="revenue" fill="#ff4e00" radius={[8, 8, 0, 0]} barSize={40} />
                            </BarChart>
                          </ResponsiveContainer>
                        </CardContent>
                      </Card>

                      <Card className="sleek-card border-none overflow-hidden">
                        <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-border/50">
                          <CardTitle className="text-xl font-bold">Alertas de Stock Bajo</CardTitle>
                          <Button variant="link" className="text-primary font-bold" onClick={() => setActiveTab('inventario')}>Gestionar Todo</Button>
                        </CardHeader>
                        <CardContent className="p-0">
                          <Table>
                            <TableHeader className="bg-secondary/30">
                              <TableRow className="border-border/50 hover:bg-transparent">
                                <TableHead className="text-muted-foreground font-bold px-8 py-5 text-[10px] uppercase tracking-widest leading-none">Producto</TableHead>
                                <TableHead className="text-muted-foreground font-bold px-8 py-5 text-[10px] uppercase tracking-widest leading-none">Precio</TableHead>
                                <TableHead className="text-muted-foreground font-bold px-8 py-5 text-[10px] uppercase tracking-widest leading-none">Stock</TableHead>
                                <TableHead className="text-muted-foreground font-bold px-8 py-5 text-[10px] uppercase tracking-widest leading-none">Estado</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {products.filter(p => p.stock < 15).slice(0, 6).map(p => (
                                <TableRow key={p.id} className="border-b border-border/30 hover:bg-secondary/10 transition-colors">
                                  <TableCell className="px-8 py-5 font-bold text-foreground">
                                    <div className="flex items-center">
                                      {p.imagen_url && <img src={p.imagen_url} className="w-8 h-8 rounded-lg mr-3 object-cover border border-border" referrerPolicy="no-referrer" />}
                                      {p.nombre}
                                    </div>
                                  </TableCell>
                                  <TableCell className="px-8 py-5 font-medium text-muted-foreground">${p.precio.toLocaleString()}</TableCell>
                                  <TableCell className="px-8 py-5 font-black text-foreground">{p.stock}</TableCell>
                                  <TableCell className="px-8 py-5">
                                    <span className={`badge ${p.stock <= 5 ? 'badge-danger' : 'badge-warning'}`}>
                                      {p.stock === 0 ? 'SIN STOCK' : p.stock <= 5 ? 'CRÍTICO' : 'BAJO'}
                                    </span>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="space-y-10">
                      <Card className="sleek-card border-none bg-primary text-white p-8 flex flex-col gap-6 shadow-xl shadow-primary/30">
                        <div className="flex items-center gap-3">
                           <div className="bg-white/20 p-2.5 rounded-xl">
                             <ShoppingCart className="w-6 h-6 text-white" />
                           </div>
                           <h2 className="text-xl font-black uppercase tracking-tight">Venta en Curso</h2>
                        </div>
                        
                        <div className="bg-white/10 rounded-2xl p-6 flex-1 flex flex-col gap-6 backdrop-blur-sm border border-white/20">
                          {cart.length > 0 ? (
                            <div className="space-y-4">
                              {cart.slice(0, 5).map(item => (
                                <div key={item.id} className="flex justify-between items-center pb-3 border-b border-white/10">
                                  <div className="flex flex-col">
                                    <span className="text-[10px] uppercase font-bold text-white/60 tracking-widest">PROD</span>
                                    <span className="text-sm font-bold truncate max-w-[120px]">{item.nombre}</span>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-[10px] uppercase font-bold text-white/60 tracking-widest">SUB</span>
                                    <div className="text-sm font-black">${(item.precio * item.cantidad).toLocaleString()}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="flex-1 flex flex-col items-center justify-center opacity-40 text-white gap-4 py-10">
                               <ShoppingCart size={48} strokeWidth={1.5} />
                               <span className="text-xs font-black tracking-[0.2em] uppercase">Esperando Orden</span>
                            </div>
                          )}
                          
                          <div className="mt-auto pt-6 border-t border-white/20">
                            <div className="flex justify-between items-end">
                               <span className="text-xs font-bold text-white/70 uppercase tracking-widest">Total Acumulado:</span>
                               <div className="text-4xl font-black text-white tracking-tighter">${totalCart.toLocaleString()}</div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3 mt-2">
                             <Button 
                               variant="outline"
                               className="bg-white border-white/20 text-primary hover:bg-white/90 font-black py-7 rounded-2xl text-sm shadow-lg flex-1"
                               onClick={() => setActiveTab('ventas')}
                             >
                               MODIFICAR
                             </Button>
                             <Button 
                               className="bg-white text-primary hover:bg-white/90 font-black py-7 rounded-2xl text-sm shadow-lg flex-1"
                               onClick={handleProcessSale}
                               disabled={cart.length === 0}
                             >
                               REGISTRAR
                             </Button>
                          </div>
                        </div>
                      </Card>

                      <Card className="sleek-card border-none p-8 space-y-6">
                        <h3 className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground">Accesos Directos</h3>
                        <div className="grid grid-cols-2 gap-4">
                           <QuickAction icon={<Plus className="w-4 h-4" />} label="Prod" onClick={() => setActiveTab('inventario')} />
                           <QuickAction icon={<Search className="w-4 h-4" />} label="Buscar" onClick={() => setActiveTab('inventario')} />
                           <QuickAction icon={<Download className="w-4 h-4" />} label="Exp" onClick={exportSales} />
                           <QuickAction icon={<History className="w-4 h-4" />} label="Hist" onClick={() => setActiveTab('historial')} />
                        </div>
                      </Card>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'inventario' && (
                <motion.div key="inventario" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                  <div className="flex flex-col lg:flex-row justify-between items-center bg-card p-4 lg:p-8 rounded-3xl shadow-sm border border-border gap-4">
                    <div className="relative w-full lg:max-w-sm">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input 
                        placeholder="Filtrar por nombre..." 
                        className="pl-12 bg-secondary/50 border-border h-12 rounded-2xl focus:ring-primary/20 text-sm font-medium w-full"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                    <div className="flex w-full lg:w-auto h-12 gap-3 lg:gap-4">
                      <Button variant="outline" className="flex-1 lg:flex-none border-border bg-card hover:bg-secondary/50 h-full rounded-2xl px-4 lg:px-8 font-bold text-xs lg:text-sm shadow-sm" onClick={exportInventory}>
                        <Download size={18} className="lg:mr-2" /> Exportar <span className="hidden sm:inline">Excel</span>
                      </Button>
                      <Button className="flex-1 lg:flex-none bg-primary hover:bg-primary/90 text-white font-black h-full rounded-2xl px-4 lg:px-8 text-xs lg:text-sm shadow-lg shadow-primary/20" onClick={openAddModal}>
                        <Plus size={18} className="lg:mr-2" /> Nuevo <span className="hidden sm:inline">Producto</span>
                      </Button>
                    </div>
                  </div>

                  <Card className="sleek-card border-none overflow-hidden">
                    <div className="overflow-x-auto">
                      <Table>
                      <TableHeader className="bg-secondary/30">
                        <TableRow className="border-border/50 hover:bg-transparent">
                          <TableHead className="text-muted-foreground font-bold px-10 py-6 text-[10px] uppercase tracking-widest leading-none">Imagen</TableHead>
                          <TableHead className="text-muted-foreground font-bold px-10 py-6 text-[10px] uppercase tracking-widest leading-none">Nombre del Producto</TableHead>
                          <TableHead className="text-muted-foreground font-bold px-10 py-6 text-[10px] uppercase tracking-widest leading-none">Precio</TableHead>
                          <TableHead className="text-muted-foreground font-bold px-10 py-6 text-[10px] uppercase tracking-widest leading-none">Stock</TableHead>
                          <TableHead className="text-muted-foreground font-bold px-10 py-6 text-[10px] uppercase tracking-widest leading-none">Estado</TableHead>
                          <TableHead className="text-right text-muted-foreground font-bold px-10 py-6 text-[10px] uppercase tracking-widest leading-none">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {products.filter(p => p.nombre.toLowerCase().includes(searchTerm.toLowerCase())).map((p) => (
                          <TableRow key={p.id} className="border-b border-border/30 hover:bg-secondary/10 transition-colors">
                            <TableCell className="px-10 py-6">
                              <div className="w-14 h-14 rounded-2xl bg-secondary/50 border border-border overflow-hidden shadow-sm">
                                {p.imagen_url ? (
                                  <img src={p.imagen_url} className="w-full h-full object-cover" alt={p.nombre} referrerPolicy="no-referrer" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                                  <ShoppingCart size={24} strokeWidth={1} />
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="px-10 py-6">
                              <div className="font-black text-foreground text-lg tracking-tight uppercase">{p.nombre}</div>
                              <div className="text-[10px] font-bold text-muted-foreground tracking-widest">REF: {p.id.toString().padStart(6, '0')}</div>
                            </TableCell>
                            <TableCell className="px-10 py-6 font-black text-foreground text-lg">${p.precio.toLocaleString()}</TableCell>
                            <TableCell className="px-10 py-6 font-medium text-foreground">{p.stock} UNIDADES</TableCell>
                            <TableCell className="px-10 py-6">
                              <span className={`badge ${p.stock > 10 ? 'badge-success' : p.stock > 0 ? 'badge-warning' : 'badge-danger'}`}>
                                {p.stock > 10 ? 'ESTABLE' : p.stock > 0 ? 'REPOSICIÓN' : 'SIN STOCK'}
                              </span>
                            </TableCell>
                            <TableCell className="px-10 py-6 text-right">
                              <div className="flex items-center justify-end space-x-3">
                                <Button variant="ghost" size="icon" className="h-12 w-12 hover:bg-secondary rounded-2xl text-muted-foreground transition-all" onClick={() => openEditModal(p)}><RefreshCcw size={18} /></Button>
                                <Button variant="ghost" size="icon" className="h-12 w-12 hover:bg-destructive/10 hover:text-destructive rounded-2xl text-muted-foreground transition-all" onClick={() => confirmDelete(p)}><Trash2 size={18} /></Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
                </motion.div>
              )}

              {activeTab === 'ventas' && (
                <motion.div key="ventas" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 lg:grid-cols-12 gap-10 relative">
                  <div className="lg:col-span-8 space-y-8">
                    <div className="bg-card p-6 rounded-3xl border border-border shadow-sm mb-6 flex items-center gap-4">
                      <Search className="text-muted-foreground" size={20} />
                      <Input 
                        placeholder="Buscar producto a vender..." 
                        className="border-none bg-transparent focus-visible:ring-0 text-lg font-bold p-0 placeholder:text-muted-foreground/40"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 lg:gap-4">
                      {products.filter(p => (p.stock > 0 || true) && p.nombre.toLowerCase().includes(searchTerm.toLowerCase())).map(p => (
                        <Card 
                          key={p.id} 
                          className="sleek-card border-none hover:ring-2 hover:ring-primary/20 cursor-pointer overflow-hidden group transition-all active:scale-[0.98]"
                          onClick={() => addToCart(p)}
                        >
                          <div className="relative h-28 lg:h-32 bg-secondary/20 overflow-hidden">
                             {p.imagen_url ? (
                               <img src={p.imagen_url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt={p.nombre} referrerPolicy="no-referrer" />
                             ) : (
                               <div className="w-full h-full flex items-center justify-center">
                                 <ShoppingCart className="w-8 h-8 text-muted-foreground/10 group-hover:text-primary/10 transition-colors" />
                               </div>
                             )}
                             <div className="absolute top-2 right-2 h-6 px-2 bg-black/60 backdrop-blur-md rounded-lg flex items-center shadow-lg border border-white/10">
                                <span className="text-[10px] font-black text-white italic uppercase tracking-wider">${p.precio.toLocaleString()}</span>
                             </div>
                             {p.stock <= 5 && (
                               <div className="absolute top-2 left-2 h-6 px-2 bg-amber-500 rounded-lg flex items-center shadow-lg border border-amber-600/20">
                                  <span className="text-[8px] font-black text-black uppercase tracking-wider">{p.stock} LEFT</span>
                                </div>
                             )}
                          </div>
                          <CardContent className="p-3 flex flex-col gap-1 bg-white">
                            <span className="text-[10px] font-black text-foreground uppercase tracking-tight line-clamp-1">{p.nombre}</span>
                            <div className="flex justify-between items-center mt-0.5">
                               <div className="flex items-center text-primary font-black text-sm">
                                 <span className="text-[10px] mr-1 mt-0.5">$</span>
                                 {p.precio.toLocaleString()}
                               </div>
                               <div className="p-1 bg-secondary rounded-md group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                 <Plus size={12} />
                               </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>

                  {/* Cart Sidebar (Desktop) or Drawer (Mobile) */}
                  <div className={`
                    lg:col-span-4 fixed lg:sticky inset-x-0 bottom-0 top-0 lg:top-24 z-40 lg:z-0
                    transition-transform duration-300 lg:translate-y-0
                    ${isCartOpen ? 'translate-y-0' : 'translate-y-full lg:translate-y-0'}
                  `}>
                    {/* Backdrop for mobile */}
                    <div className="absolute inset-0 bg-black/50 lg:hidden" onClick={() => setIsCartOpen(false)} />
                    
                    <Card className="absolute lg:relative bottom-0 lg:bottom-auto w-full h-[85vh] lg:h-[calc(100vh-140px)] sleek-card border-none flex flex-col rounded-t-[32px] lg:rounded-3xl overflow-hidden shadow-2xl">
                      <div className="p-6 border-b border-border/50 flex justify-between items-center bg-white shadow-sm flex-shrink-0 z-10">
                        <h3 className="font-black uppercase tracking-tight flex items-center text-base"><ShoppingCart className="mr-3 text-primary" size={20} /> Orden Actual</h3>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-primary/10 text-primary border-primary/20 px-3 py-1 rounded-full font-black text-[10px]">{cart.length} ITEMS</Badge>
                          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setIsCartOpen(false)}>
                            <X size={20} />
                          </Button>
                        </div>
                      </div>
                      <CardContent className="flex-1 flex flex-col p-0 bg-secondary/10 overflow-hidden relative">
                        <div className="flex-1 overflow-y-auto p-4 lg:p-6 scrollbar-hide">
                          {cart.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-20 text-center gap-6 py-10">
                              <ShoppingCart size={64} strokeWidth={1} className="animate-bounce-slow" />
                              <div className="space-y-2">
                                <p className="font-black tracking-[0.3em] uppercase text-xs">CARRITO VACÍO</p>
                                <p className="text-[10px] font-bold leading-relaxed px-10">Seleccione productos para generar una nueva venta</p>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-3 pb-4">
                              {cart.map(item => (
                                <div key={item.id} className="flex items-center justify-between group p-3 bg-white rounded-2xl border border-border shadow-sm hover:border-primary/20 transition-all">
                                  <div className="flex items-center min-w-0">
                                    {item.imagen_url && <img src={item.imagen_url} className="w-8 h-8 rounded-lg mr-3 object-cover border border-border flex-shrink-0" referrerPolicy="no-referrer" />}
                                    <div className="flex flex-col min-w-0">
                                      <span className="text-xs font-black text-foreground uppercase tracking-tight truncate">{item.nombre}</span>
                                      <span className="text-[10px] font-bold text-muted-foreground uppercase">{item.cantidad} x ${item.precio.toLocaleString()}</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3 flex-shrink-0">
                                    <span className="font-black text-foreground italic tracking-tighter text-sm">${(item.precio * item.cantidad).toLocaleString()}</span>
                                    <button className="text-muted-foreground hover:text-destructive p-2 bg-secondary rounded-xl transition-colors" onClick={() => removeFromCart(item.id)}><X className="h-3.5 w-3.5" /></button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        
                        <div className="p-6 bg-white border-t border-border shadow-[0_-10px_30px_rgba(0,0,0,0.03)] space-y-4 flex-shrink-0 z-10 w-full">
                          <div className="space-y-3">
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-muted-foreground text-[10px] font-bold uppercase tracking-[0.2em]">Subtotal</span>
                              <span className="font-bold text-foreground">${totalCart.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center bg-primary/5 p-4 rounded-2xl border border-primary/10">
                              <span className="text-primary text-[10px] font-black uppercase tracking-[0.2em]">Total a Pagar</span>
                              <span className="text-2xl lg:text-3xl font-black text-foreground tracking-tighter">${totalCart.toLocaleString()}</span>
                            </div>
                          </div>

                        </div>

                        <div className="space-y-4">
                           <div className="space-y-3">
                             <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-[0.2em] ml-1">Método de Pago</label>
                             <div className="grid grid-cols-3 gap-2">
                               {['Efectivo', 'Nequi', 'Transfer'].map(m => (
                                 <button 
                                   key={m}
                                   onClick={() => setMetodoPago(m)}
                                   className={`h-10 rounded-xl text-[9px] font-black border transition-all ${
                                     metodoPago === m ? 'bg-primary/10 border-primary text-primary shadow-sm' : 'bg-secondary/40 border-border text-muted-foreground hover:bg-secondary'
                                   }`}
                                 >
                                   {m.toUpperCase()}
                                 </button>
                               ))}
                             </div>
                           </div>
                           
                           {metodoPago === 'Efectivo' && (
                             <div className="grid grid-cols-2 gap-3">
                               <div className="space-y-2">
                                 <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-[0.2em] ml-1">Recibido</label>
                                 <Input 
                                   type="number" 
                                   className="bg-secondary/40 border-border h-10 rounded-xl text-xs font-bold focus:ring-primary/20" 
                                   placeholder="$ 0.00"
                                   onChange={(e) => setMontoRecibido(Number(e.target.value))}
                                 />
                               </div>
                               <div className="space-y-2">
                                 <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-[0.2em] ml-1">Cambio</label>
                                 <div className={`h-10 bg-secondary/40 border border-border rounded-xl flex items-center px-4 text-xs font-black ${cambio < 0 ? 'text-destructive' : 'text-green-600'}`}>
                                   $ {cambio.toLocaleString()}
                                 </div>
                               </div>
                             </div>
                           )}
                        </div>

                        <Button 
                          className="w-full bg-primary hover:bg-primary/90 text-white font-black h-16 rounded-2xl text-lg shadow-xl shadow-primary/20 transition-all active:scale-[0.98] active:shadow-none" 
                          disabled={cart.length === 0}
                          onClick={handleProcessSale}
                        >
                          REGISTRAR VENTA
                        </Button>
                    </CardContent>
                  </Card>
                </div>
              </motion.div>
              )}

              {activeTab === 'historial' && (
                <motion.div key="historial" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="bg-card p-8 rounded-3xl border border-border shadow-sm flex flex-col gap-2">
                        <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Ventas de Hoy</span>
                        <span className="text-3xl font-black text-primary">${todayRevenue.toLocaleString()}</span>
                      </div>
                      <div className="bg-card p-8 rounded-3xl border border-border shadow-sm flex flex-col gap-2">
                        <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Total Transacciones</span>
                        <span className="text-3xl font-black text-foreground">{sales.length}</span>
                      </div>
                      <div className="bg-card p-8 rounded-3xl border border-border shadow-sm flex flex-col gap-2">
                        <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Última Venta</span>
                        <span className="text-3xl font-black text-foreground">
                          {sales.length > 0 ? `$${sales[0].total.toLocaleString()}` : '---'}
                        </span>
                      </div>
                   </div>

                   <div className="flex flex-col gap-6">
                     <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-card p-10 rounded-3xl border border-border shadow-sm gap-8">
                        <div>
                          <h3 className="text-2xl font-black tracking-tight">Registro de Ventas</h3>
                          <p className="text-sm text-muted-foreground font-medium">Filtra y analiza el historial de transacciones</p>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-4">
                          <div className="bg-secondary/40 p-1.5 rounded-2xl border border-border flex items-center gap-1">
                            {[
                              { id: 'all', label: 'TODO' },
                              { id: 'day', label: 'HOY' },
                              { id: 'specific', label: 'DÍA' },
                              { id: 'week', label: '7D' },
                              { id: 'month', label: '30D' },
                              { id: 'custom', label: 'RANGO' }
                            ].map(f => (
                              <button
                                key={f.id}
                                onClick={() => setHistoryFilter(f.id as any)}
                                className={`px-4 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all ${
                                  historyFilter === f.id ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-muted-foreground hover:bg-white'
                                }`}
                              >
                                {f.label}
                              </button>
                            ))}
                          </div>
                          
                          {historyFilter === 'specific' && (
                            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-4 duration-300">
                              <Input 
                                type="date" 
                                className="h-11 w-44 bg-white border-border rounded-xl text-xs font-bold"
                                value={filterSingleDate}
                                onChange={(e) => setFilterSingleDate(e.target.value)}
                              />
                            </div>
                          )}

                          {historyFilter === 'custom' && (
                            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-4 duration-300">
                              <Input 
                                type="date" 
                                className="h-11 w-40 bg-white border-border rounded-xl text-xs font-bold"
                                value={filterStartDate}
                                onChange={(e) => setFilterStartDate(e.target.value)}
                              />
                              <span className="text-muted-foreground text-xs font-black">→</span>
                              <Input 
                                type="date" 
                                className="h-11 w-40 bg-white border-border rounded-xl text-xs font-bold"
                                value={filterEndDate}
                                onChange={(e) => setFilterEndDate(e.target.value)}
                              />
                            </div>
                          )}
                          
                          <div className="flex items-center gap-3">
                            <Button variant="outline" className="border-border bg-white hover:bg-secondary rounded-2xl h-12 px-8 font-black text-[10px] tracking-widest uppercase shadow-sm" onClick={exportSales}>
                              <Download size={16} className="mr-3" /> Exportar
                            </Button>
                            <Button variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive rounded-2xl h-12 px-6 font-black text-[10px] tracking-widest uppercase" onClick={() => setIsDeleteHistoryModalOpen(true)}>
                              <Trash2 size={16} className="mr-3" /> Limpiar Todo
                            </Button>
                          </div>
                        </div>
                     </div>

                    <Card className="sleek-card border-none overflow-hidden">
                      <div className="overflow-x-auto">
                        <Table>
                        <TableHeader className="bg-secondary/30">
                          <TableRow className="border-border/50 hover:bg-transparent">
                            <TableHead className="text-muted-foreground font-bold px-10 py-6 text-[10px] uppercase tracking-widest leading-none">Fecha y Hora</TableHead>
                            <TableHead className="text-muted-foreground font-bold px-10 py-6 text-[10px] uppercase tracking-widest leading-none">Venta ID</TableHead>
                            <TableHead className="text-muted-foreground font-bold px-10 py-6 text-[10px] uppercase tracking-widest leading-none">Método</TableHead>
                            <TableHead className="text-muted-foreground font-bold px-10 py-6 text-[10px] uppercase tracking-widest leading-none">Monto Total</TableHead>
                            <TableHead className="text-right text-muted-foreground font-bold px-10 py-6 text-[10px] uppercase tracking-widest leading-none">Estado</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredSales.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={5} className="h-60 text-center text-muted-foreground italic font-medium">No se encontraron ventas en este periodo</TableCell>
                            </TableRow>
                          ) : (
                            filteredSales.map(s => (
                              <TableRow key={s.id} className="border-b border-border/30 hover:bg-secondary/10 transition-colors">
                                <TableCell className="px-10 py-6 text-muted-foreground font-bold text-xs uppercase">{new Date(s.fecha).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</TableCell>
                                <TableCell className="px-10 py-6">
                                   <div className="flex items-center font-black tracking-tighter text-foreground">
                                     <RefreshCcw size={14} className="mr-3 text-primary/40" />
                                     #{s.id.toString().padStart(8, '0')}
                                   </div>
                                </TableCell>
                                <TableCell className="px-10 py-6">
                                   <span className="px-4 py-1.5 bg-secondary/80 rounded-full border border-border text-[10px] font-black text-foreground uppercase tracking-wider">{s.metodo_pago}</span>
                                </TableCell>
                                <TableCell className="px-10 py-6 font-black text-foreground text-xl tracking-tighter">${s.total.toLocaleString()}</TableCell>
                                <TableCell className="px-10 py-6 text-right"><span className="badge badge-success">COMPLETADO</span></TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </Card>
                  </div>
                </motion.div>
              )}

              {activeTab === 'analíticas' && (
                <motion.div key="analíticas" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-10">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                    <Card className="sleek-card border-none">
                      <CardHeader className="p-10 border-b border-border/50">
                        <CardTitle className="text-xl font-bold flex items-center"><TrendingUp className="mr-3 text-primary" /> Productos Estrella</CardTitle>
                      </CardHeader>
                      <CardContent className="h-96 p-10">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={productSales} layout="vertical">
                            <CartesianGrid strokeDasharray="0" stroke="#f1f3f5" horizontal={false} />
                            <XAxis type="number" stroke="#94a3b8" fontSize={12} axisLine={false} tickLine={false} />
                            <YAxis dataKey="nombre" type="category" stroke="#1a1a1a" fontSize={12} width={140} axisLine={false} tickLine={false} className="font-bold uppercase tracking-tighter" />
                            <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                            <Bar dataKey="total_vendido" fill="#ff4e00" radius={[0, 10, 10, 0]} barSize={30} />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    <Card className="sleek-card border-none">
                      <CardHeader className="p-10 border-b border-border/50">
                        <CardTitle className="text-xl font-bold flex items-center"><BarChart3 className="mr-3 text-primary" /> Distribución de Ventas</CardTitle>
                      </CardHeader>
                      <CardContent className="h-96 p-10 flex flex-col items-center justify-center">
                        <div className="relative w-full h-[280px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={productSales}
                                dataKey="total_vendido"
                                nameKey="nombre"
                                cx="50%"
                                cy="50%"
                                innerRadius={80}
                                outerRadius={110}
                                paddingAngle={6}
                              >
                                {productSales.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="rgba(0,0,0,0)" />
                                ))}
                              </Pie>
                              <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px' }} />
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em]">Total Art.</span>
                            <span className="text-3xl font-black text-foreground">{productSales.reduce((acc, curr) => acc + Number(curr.total_vendido), 0)}</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 w-full gap-4 mt-10">
                           {productSales.slice(0, 6).map((entry, index) => (
                             <div key={index} className="flex items-center space-x-3 p-3 bg-secondary/30 rounded-2xl border border-transparent hover:border-border transition-all">
                               <div className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                               <span className="text-xs font-bold text-foreground uppercase tracking-tighter truncate">{entry.nombre}</span>
                             </div>
                           ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </ScrollArea>
      </div>
      <Dialog open={isProductModalOpen} onOpenChange={setIsProductModalOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl border-none shadow-2xl p-8 bg-card">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tight">
              {editingProduct ? 'Editar Producto' : 'Crear Nuevo Producto'}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground font-medium">
              {editingProduct ? 'Actualiza los datos del producto existente.' : 'Ingresa los detalles para el nuevo producto del inventario.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 py-8">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest ml-1">Nombre</Label>
              <Input 
                placeholder="Ej. Granizado Personalizado" 
                className="h-12 bg-secondary/50 border-border rounded-xl font-medium" 
                value={newProduct.nombre}
                onChange={(e) => setNewProduct({...newProduct, nombre: e.target.value})}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest ml-1">Precio ($)</Label>
                <Input 
                  type="number"
                  placeholder="0" 
                  className="h-12 bg-secondary/50 border-border rounded-xl font-medium" 
                  value={newProduct.precio}
                  onChange={(e) => setNewProduct({...newProduct, precio: Number(e.target.value)})}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest ml-1">Stock Inicial</Label>
                <Input 
                  type="number"
                  placeholder="0" 
                  className="h-12 bg-secondary/50 border-border rounded-xl font-medium" 
                  value={newProduct.stock}
                  onChange={(e) => setNewProduct({...newProduct, stock: Number(e.target.value)})}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest ml-1">URL de Imagen (Opcional)</Label>
              <Input 
                placeholder="https://..." 
                className="h-12 bg-secondary/50 border-border rounded-xl font-medium" 
                value={newProduct.imagen_url}
                onChange={(e) => setNewProduct({...newProduct, imagen_url: e.target.value})}
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              className="w-full h-14 bg-primary hover:bg-primary/90 text-white rounded-2xl font-black text-lg transition-all"
              onClick={handleSaveProduct}
            >
              {editingProduct ? 'GUARDAR CAMBIOS' : 'CREAR PRODUCTO'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent className="sm:max-w-[400px] rounded-3xl border-none shadow-2xl p-8 bg-card">
          <DialogHeader className="items-center text-center">
            <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4 text-destructive">
              <AlertTriangle size={32} />
            </div>
            <DialogTitle className="text-xl font-black uppercase tracking-tight">Confirmar Eliminación</DialogTitle>
            <DialogDescription className="text-muted-foreground font-medium text-sm">
              ¿Estás seguro que deseas eliminar <span className="font-bold text-foreground">"{productToDelete?.nombre}"</span>? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="grid grid-cols-2 gap-4 mt-6">
            <Button 
              variant="outline" 
              className="rounded-2xl h-12 font-bold"
              onClick={() => setIsDeleteModalOpen(false)}
            >
              CANCELAR
            </Button>
            <Button 
              variant="destructive"
              className="rounded-2xl h-12 font-black shadow-lg shadow-destructive/20"
              onClick={handleDeleteProduct}
            >
              ELIMINAR
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Delete Sales History Modal */}
      <Dialog open={isDeleteHistoryModalOpen} onOpenChange={setIsDeleteHistoryModalOpen}>
        <DialogContent className="sm:max-w-[400px] rounded-3xl border-none shadow-2xl p-8 bg-card">
          <DialogHeader className="items-center text-center">
            <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4 text-destructive">
              <AlertTriangle size={32} />
            </div>
            <DialogTitle className="text-xl font-black uppercase tracking-tight">Limpiar Historial</DialogTitle>
            <DialogDescription className="text-muted-foreground font-medium text-sm">
              ¿Estás seguro que deseas eliminar <span className="font-bold text-foreground">TODO el historial de ventas</span>? Esta acción es irreversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="grid grid-cols-2 gap-4 mt-6">
            <Button 
              variant="outline" 
              className="rounded-2xl h-12 font-bold"
              onClick={() => setIsDeleteHistoryModalOpen(false)}
            >
              CANCELAR
            </Button>
            <Button 
              variant="destructive"
              className="rounded-2xl h-12 font-black shadow-lg shadow-destructive/20"
              onClick={handleDeleteHistory}
            >
              ELIMINAR TODO
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Toaster theme="light" position="top-right" richColors />
    </div>
  );
}

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`sidebar-link ${active ? 'active' : ''}`}
    >
      <span className={active ? 'text-primary' : 'text-muted-foreground'}>{icon}</span>
      <span className="uppercase tracking-tight">{label}</span>
    </button>
  );
}

function StatCard({ title, value, icon }: { title: string, value: string | number, icon: React.ReactNode }) {
  return (
    <Card className="sleek-card border-none p-8 group hover:translate-y-[-4px] transition-all">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground">{title}</p>
          <div className="p-3.5 bg-primary/5 rounded-2xl group-hover:bg-primary group-hover:text-white transition-all duration-300">
            {icon}
          </div>
        </div>
        <h4 className="text-4xl font-black text-foreground tracking-tighter">{value}</h4>
      </div>
    </Card>
  );
}

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="flex items-center justify-center flex-col gap-2 p-4 bg-secondary/50 rounded-2xl border border-border hover:border-primary/30 hover:bg-white transition-all group"
    >
      <div className="p-2 bg-white rounded-lg shadow-sm group-hover:text-primary transition-colors">
        {icon}
      </div>
      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</span>
    </button>
  );
}
