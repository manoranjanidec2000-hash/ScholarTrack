import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

export default function DeadlineChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 20, left: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke="#e8edf1" />
        <XAxis type="number" tickLine={false} axisLine={false} tick={{ fill: '#8998a5', fontSize: 11 }} />
        <YAxis type="category" dataKey="name" width={142} tickLine={false} axisLine={false} tick={{ fill: '#334554', fontSize: 11 }} />
        <Tooltip cursor={{ fill: '#f2f8f9' }} formatter={(value) => [`${value} days`, 'Time remaining']} />
        <Bar dataKey="days" fill="#27b8c6" radius={[0, 5, 5, 0]} barSize={13} />
      </BarChart>
    </ResponsiveContainer>
  );
}