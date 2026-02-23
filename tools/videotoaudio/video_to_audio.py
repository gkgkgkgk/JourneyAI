import sys
import os

def convert_mp4_to_mp3(input_file, output_file=None):
    """
    Extracts audio from an MP4 file and saves it as an MP3 file.
    
    To use this script, you need to install moviepy:
    pip install moviepy
    """
    try:
        from moviepy import VideoFileClip          # moviepy v2.x
    except ImportError:
        try:
            from moviepy.editor import VideoFileClip  # moviepy v1.x
        except ImportError:
            print("\n[!] Error: 'moviepy' library not found.")
            print("Please install it by running: pip install moviepy\n")
            return

    if not output_file:
        # Create output filename by replacing extension with .mp3
        output_file = os.path.splitext(input_file)[0] + ".mp3"
    
    print(f"[*] Processing: {input_file}")
    
    try:
        # Load the video clip
        video = VideoFileClip(input_file)
        
        if video.audio is None:
            print("[!] Error: No audio track found in the video file.")
            video.close()
            return
            
        # Extract and write the audio
        print(f"[*] Extracting audio to: {output_file}")
        video.audio.write_audiofile(output_file, logger=None)
        
        # Close the clips to release the files
        video.audio.close()
        video.close()
        
        print(f"[+] Success! Audio saved to {output_file}")
        
    except Exception as e:
        print(f"[!] An error occurred during conversion: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("\nJourneyAI Video-to-Audio Converter")
        print("-" * 35)
        print("Usage: python video_to_audio.py <input_video_file> [output_audio_file]")
        print("Example: python video_to_audio.py lecture.mp4")
        print("-" * 35 + "\n")
    else:
        input_path = sys.argv[1]
        output_path = sys.argv[2] if len(sys.argv) > 2 else None
        
        if not os.path.exists(input_path):
            print(f"[!] Error: File '{input_path}' not found.")
        else:
            convert_mp4_to_mp3(input_path, output_path)
