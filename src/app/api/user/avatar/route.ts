import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = (formData.get("file") || formData.get("avatar")) as File | null;

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
    }

    const mimeType = file.type;
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(mimeType)) {
      return NextResponse.json(
        { error: "Formato inválido. Envie uma imagem (JPG, PNG, WebP ou GIF)" },
        { status: 400 }
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Arquivo muito grande. O limite máximo é de 5MB." },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const uploadResult = await new Promise<any>((resolve, reject) => {
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
            else resolve(result);
          }
        )
        .end(buffer);
    });

    const avatarUrl = uploadResult.secure_url;

    const supabase = createServiceClient();
    const { error: updateError } = await supabase
      .from("users")
      .update({ avatar_url: avatarUrl })
      .eq("id", user.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Foto de perfil atualizada com sucesso!",
      avatar_url: avatarUrl,
    });
  } catch (error: any) {
    console.error("Erro no upload de avatar:", error);
    return NextResponse.json(
      { error: "Erro interno ao processar upload" },
      { status: 500 }
    );
  }
}
