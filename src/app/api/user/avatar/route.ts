import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase";
import { v2 as cloudinary } from "cloudinary";

const MAX_TAMANHO = 5 * 1024 * 1024;
const TIPOS_PERMITIDOS = ["image/jpeg", "image/png", "image/webp", "image/gif"];

type CloudinaryApiError = {
  name?: string;
  message?: string;
  http_code?: number;
  error?: { message?: string };
  cause?: unknown;
  stack?: string;
};

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    // 1) Valida as credenciais do Cloudinary antes de tentar o upload
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
    const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
    const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
    const estaNoVercel = process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);

    if (!cloudName || !apiKey || !apiSecret) {
      console.error("[AVATAR] Credenciais do Cloudinary ausentes:", {
        CLOUDINARY_CLOUD_NAME: !!cloudName,
        CLOUDINARY_API_KEY: !!apiKey,
        CLOUDINARY_API_SECRET: !!apiSecret,
      });
      return NextResponse.json(
        {
          error:
            estaNoVercel
              ? "Upload de fotos indisponível: configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET nas variáveis de ambiente do Vercel para Production e publique um novo deploy."
              : "Cloudinary não configurado. Verifique CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET no .env.local.",
        },
        { status: 500 }
      );
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });

    // 2) Extrai o arquivo do FormData
    const formData = await req.formData();
    const file = (formData.get("file") || formData.get("avatar")) as File | null;

    if (!file || typeof file === "string") {
      console.error("[AVATAR] Campo 'file' ausente no FormData. Campos recebidos:", Array.from(formData.keys()));
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
    }

    const mimeType = file.type;
    if (!TIPOS_PERMITIDOS.includes(mimeType)) {
      return NextResponse.json(
        { error: "Formato inválido. Envie uma imagem (JPG, PNG, WebP ou GIF)" },
        { status: 400 }
      );
    }

    if (file.size > MAX_TAMANHO) {
      return NextResponse.json(
        { error: "Arquivo muito grande. O limite máximo é de 5MB." },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 3) Envia para o Cloudinary
    const uploadResult = await new Promise<{ secure_url: string }>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: "rank-farm/avatars",
            public_id: `avatar-${user.id}`,
            overwrite: true,
            resource_type: "image",
          },
          (error, result) => {
            if (error) reject(error);
            else if (result?.secure_url) resolve({ secure_url: result.secure_url });
            else reject(new Error("Cloudinary não retornou a URL da imagem."));
          }
        )
        .end(buffer);
    });

    const avatarUrl = uploadResult.secure_url;

    // 4) Persiste a URL no usuário
    const supabase = createServiceClient();
    const { error: updateError } = await supabase
      .from("users")
      .update({ avatar_url: avatarUrl })
      .eq("id", user.id);

    if (updateError) {
      console.error("[AVATAR] Erro ao salvar avatar_url no Supabase:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Foto de perfil atualizada com sucesso!",
      avatar_url: avatarUrl,
    });
  } catch (error: unknown) {
    const erroCloudinary: CloudinaryApiError = typeof error === "object" && error !== null
      ? error as CloudinaryApiError
      : { message: typeof error === "string" ? error : undefined };
    // Log detalhado para o terminal
    console.error("[AVATAR] Erro no upload de avatar:", {
      name: erroCloudinary.name,
      message: erroCloudinary.message,
      http_code: erroCloudinary.http_code,
      cloudinary_error: erroCloudinary.error,
      cause: erroCloudinary.cause,
      stack: erroCloudinary.stack,
    });

    // Retorna a mensagem real do Cloudinary (ex.: "api_secret mismatch") para o frontend
    let mensagem = erroCloudinary.error?.message || erroCloudinary.message || "Erro interno ao processar upload";

    // Falha de autenticação do Cloudinary: a orientação depende do ambiente.
    if (erroCloudinary.http_code === 401 || /signature|api_secret|api_key/i.test(mensagem)) {
      console.error("[AVATAR] Cloudinary rejeitou as credenciais configuradas para este ambiente (HTTP 401).");
      mensagem = process.env.VERCEL === "1" || process.env.VERCEL_ENV
        ? "Cloudinary rejeitou as credenciais do site publicado. Atualize CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET em Vercel > Settings > Environment Variables para Production e faça um novo deploy. Não compartilhe a chave secreta."
        : "Cloudinary rejeitou as credenciais locais. Confira CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET no .env.local (Cloudinary > Settings > API Keys).";
    }

    return NextResponse.json({ error: mensagem }, { status: 500 });
  }
}
