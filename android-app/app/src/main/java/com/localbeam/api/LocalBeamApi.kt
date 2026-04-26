package com.localbeam.api

import com.localbeam.models.FileListResponse
import com.localbeam.models.ServerInfoResponse
import com.localbeam.models.StatsResponse
import com.localbeam.models.UploadResponse
import okhttp3.MultipartBody
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.*

interface LocalBeamApi {

    @GET("api/info")
    suspend fun getServerInfo(): ServerInfoResponse

    @GET("api/files")
    suspend fun listFiles(): FileListResponse

    @GET("api/stats")
    suspend fun getStats(): StatsResponse

    @Multipart
    @POST("api/upload")
    suspend fun uploadFiles(
        @Part files: List<MultipartBody.Part>
    ): UploadResponse

    @Streaming
    @GET("api/download/{filename}")
    suspend fun downloadFile(
        @Path("filename") filename: String
    ): Response<ResponseBody>

    @DELETE("api/files/{filename}")
    suspend fun deleteFile(
        @Path("filename") filename: String
    ): Response<Unit>
}
