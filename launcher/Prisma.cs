// Prisma Studio: lançador do aplicativo para Windows.
// Liga o servidor local (Node) que fala com o motor de IA, abre a janela própria do app (Edge em modo aplicativo, sem barra
// de endereço) e, quando a janela é fechada, desliga o servidor e o motor para liberar a placa de vídeo.
// Compilar: launcher\compilar.ps1 (usa o compilador de C# que já vem no Windows).
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("Prisma Studio")]
[assembly: AssemblyProduct("Prisma Studio")]
[assembly: AssemblyDescription("Estúdio local de imagens e vídeos com IA")]
[assembly: AssemblyVersion("1.0.0.0")]

static class Prisma
{
    const int Porta = 8765;
    static readonly string Url = "http://127.0.0.1:" + Porta + "/";

    [STAThread]
    static int Main()
    {
        string raiz = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
        bool primeira;
        using (var mutex = new Mutex(true, "Prisma.Studio.Instancia", out primeira))
        {
            try
            {
                if (!primeira)
                {                                   // já está aberto: só abre outra janela do mesmo app
                    AbrirJanela(raiz);
                    return 0;
                }
                return Rodar(raiz);
            }
            catch (Exception e)
            {
                MessageBox.Show("O Prisma Studio não conseguiu iniciar.\n\n" + e.Message, "Prisma Studio", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
        }
    }

    static int Rodar(string raiz)
    {
        string node = Path.Combine(raiz, "runtime", "node.exe");
        string servidor = Path.Combine(raiz, "app", "server.mjs");
        if (!File.Exists(node)) throw new FileNotFoundException("Falta o arquivo runtime\\node.exe ao lado do Prisma.exe.");
        if (!File.Exists(servidor)) throw new FileNotFoundException("Falta a pasta app\\ ao lado do Prisma.exe.");

        Process servidorProc = null;
        if (!ServidorNoAr())
        {
            var info = new ProcessStartInfo(node, "\"" + servidor + "\"")
            {
                WorkingDirectory = raiz, UseShellExecute = false, CreateNoWindow = true,
            };
            info.EnvironmentVariables["PRISMA_RAIZ"] = raiz;
            info.EnvironmentVariables["PRISMA_PORTA"] = Porta.ToString();
            servidorProc = Process.Start(info);
        }

        using (var abertura = CriarAbertura(raiz))
        {
            abertura.Show();
            var limite = DateTime.Now.AddSeconds(45);
            while (!ServidorNoAr())
            {
                if (DateTime.Now > limite) throw new TimeoutException("O servidor local não respondeu em 45 segundos.");
                if (servidorProc != null && servidorProc.HasExited) throw new InvalidOperationException("O servidor local fechou ao iniciar.");
                Application.DoEvents();
                Thread.Sleep(120);
            }
        }

        Process janela = AbrirJanela(raiz);
        if (janela != null) janela.WaitForExit();     // espera a janela ser fechada

        Desligar(servidorProc);
        return 0;
    }

    static Form CriarAbertura(string raiz)
    {
        var f = new Form
        {
            FormBorderStyle = FormBorderStyle.None, StartPosition = FormStartPosition.CenterScreen, Width = 420, Height = 150,
            BackColor = Color.FromArgb(15, 18, 24), TopMost = true, ShowInTaskbar = false,
        };
        string logo = Path.Combine(raiz, "launcher", "Prisma-256.png");
        if (File.Exists(logo)) f.Controls.Add(new PictureBox { Image = Image.FromFile(logo), SizeMode = PictureBoxSizeMode.Zoom, Left = 22, Top = 22, Width = 106, Height = 106 });
        f.Controls.Add(new Label { Text = "Prisma Studio", ForeColor = Color.White, Font = new Font("Segoe UI", 18, FontStyle.Bold), Left = 144, Top = 34, AutoSize = true });
        f.Controls.Add(new Label { Text = "Iniciando…", ForeColor = Color.FromArgb(152, 161, 181), Font = new Font("Segoe UI", 11), Left = 146, Top = 78, AutoSize = true });
        return f;
    }

    static string CaminhoNavegador()
    {
        string[] candidatos =
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Google\Chrome\Application\chrome.exe"),
        };
        foreach (string c in candidatos) if (File.Exists(c)) return c;
        throw new FileNotFoundException("Não achei o Microsoft Edge (ou o Chrome) para abrir a janela do app.");
    }

    static Process AbrirJanela(string raiz)
    {
        string perfil = Path.Combine(raiz, "perfil");
        string args = "--app=" + Url + " --user-data-dir=\"" + perfil + "\" --window-size=1360,880 --no-first-run --no-default-browser-check --disable-sync --disable-features=Translate";
        return Process.Start(new ProcessStartInfo(CaminhoNavegador(), args) { UseShellExecute = false });
    }

    static bool ServidorNoAr()
    {
        try
        {
            var req = (HttpWebRequest)WebRequest.Create(Url + "api/status");
            req.Timeout = 1200;
            using (var resp = (HttpWebResponse)req.GetResponse()) return resp.StatusCode == HttpStatusCode.OK;
        }
        catch { return false; }
    }

    // Pede ao servidor para encerrar (ele desliga o motor); se não obedecer, encerra o processo.
    static void Desligar(Process servidorProc)
    {
        try
        {
            var req = (HttpWebRequest)WebRequest.Create(Url + "api/sair");
            req.Method = "POST"; req.ContentLength = 0; req.Timeout = 3000;
            req.GetResponse().Close();
        }
        catch { /* já tinha saído */ }
        if (servidorProc != null)
        {
            if (!servidorProc.WaitForExit(8000)) { try { servidorProc.Kill(); } catch { } }
        }
    }
}
